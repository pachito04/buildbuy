-- ================================================================
-- NOTIFICATION TRIGGERS
-- ================================================================
-- Run the ALTER TYPE line FIRST (alone), then run the rest.
-- ALTER TYPE ... ADD VALUE cannot execute inside a transaction block.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'request_rejected';

-- ================================================================
-- 1. Request notifications (created, approved, rejected)
-- ================================================================

CREATE OR REPLACE FUNCTION fn_notify_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_project_name TEXT;
  v_req_num      INT;
  v_msg          TEXT;
  v_detail       TEXT;
  v_ntype        notification_type;
  v_usr          RECORD;
BEGIN
  SELECT name INTO v_project_name FROM projects WHERE id = NEW.project_id;
  v_project_name := COALESCE(v_project_name, 'Sin obra');
  v_req_num := NEW.request_number;

  -- Draft created → notify architect
  IF TG_OP = 'INSERT' AND NEW.status = 'draft' THEN
    v_ntype  := 'request_created';
    v_msg    := format('Pedido #%s de %s creado', v_req_num, v_project_name);
    v_detail := format('Has creado el nuevo pedido #%s de %s, para modificarlo debes apretar Editar borrador, para enviarlo al area de compras debes apretar Enviar pedido.', v_req_num, v_project_name);

    INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
    VALUES (NEW.company_id, NEW.created_by, v_ntype, v_msg,
      jsonb_build_object('request_id', NEW.id, 'detail_message', v_detail));

  -- Sent to approval → notify compras/admin
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'pending_approval' AND OLD.status IS DISTINCT FROM 'pending_approval' THEN
    v_ntype  := 'request_created';
    v_msg    := format('Nuevo pedido #%s de %s', v_req_num, v_project_name);
    v_detail := format('Han creado el nuevo pedido #%s de %s, lo encontrarás entre los pedidos pendientes de aprobación.', v_req_num, v_project_name);

    FOR v_usr IN
      SELECT user_id FROM user_roles
      WHERE company_id = NEW.company_id AND role IN ('compras', 'admin')
    LOOP
      INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
      VALUES (NEW.company_id, v_usr.user_id, v_ntype, v_msg,
        jsonb_build_object('request_id', NEW.id, 'detail_message', v_detail));
    END LOOP;

  -- Approved → notify architect
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    v_ntype  := 'request_approved';
    v_msg    := format('Pedido #%s de %s aprobado', v_req_num, v_project_name);
    v_detail := format('Tu Pedido #%s de %s fue aprobado por el area de compras y pronto sera enviado a los proveedores!', v_req_num, v_project_name);

    INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
    VALUES (NEW.company_id, NEW.created_by, v_ntype, v_msg,
      jsonb_build_object('request_id', NEW.id, 'detail_message', v_detail));

  -- Rejected → notify architect
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    v_ntype  := 'request_rejected';
    v_msg    := format('Pedido #%s de %s rechazado', v_req_num, v_project_name);
    v_detail := format('Tu pedido #%s de %s fue rechazado por el area de compras debido a irregularidades.', v_req_num, v_project_name);

    INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
    VALUES (NEW.company_id, NEW.created_by, v_ntype, v_msg,
      jsonb_build_object('request_id', NEW.id, 'detail_message', v_detail));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request ON requests;
CREATE TRIGGER trg_notify_request
  AFTER INSERT OR UPDATE OF status ON requests
  FOR EACH ROW EXECUTE FUNCTION fn_notify_request();

-- ================================================================
-- 2. RFQ sent → notify architect whose pedido was sent to quote
-- ================================================================

CREATE OR REPLACE FUNCTION fn_notify_rfq_sent()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req_num      INT;
  v_created_by   UUID;
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' AND NEW.request_id IS NOT NULL THEN
    SELECT request_number, created_by
    INTO v_req_num, v_created_by
    FROM requests WHERE id = NEW.request_id;

    IF v_created_by IS NOT NULL THEN
      INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
      VALUES (NEW.company_id, v_created_by, 'rfq_created',
        format('Pedido #%s enviado a cotización', v_req_num),
        jsonb_build_object(
          'rfq_id', NEW.id,
          'request_id', NEW.request_id,
          'detail_message', format('Tu pedido #%s fue enviado a cotización, los proveedores están cotizando!', v_req_num)
        ));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_rfq_sent ON rfqs;
CREATE TRIGGER trg_notify_rfq_sent
  AFTER UPDATE OF status ON rfqs
  FOR EACH ROW EXECUTE FUNCTION fn_notify_rfq_sent();

-- ================================================================
-- 3. Quote received → notify compras/admin users
-- ================================================================

CREATE OR REPLACE FUNCTION fn_notify_quote_received()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_provider_name TEXT;
  v_company_id    UUID;
  v_request_id    UUID;
  v_req_num       INT;
  v_detail        TEXT;
  v_usr           RECORD;
BEGIN
  SELECT name INTO v_provider_name FROM providers WHERE id = NEW.provider_id;
  v_provider_name := COALESCE(v_provider_name, 'Proveedor');

  SELECT company_id, request_id INTO v_company_id, v_request_id
  FROM rfqs WHERE id = NEW.rfq_id;

  IF v_request_id IS NOT NULL THEN
    SELECT request_number INTO v_req_num FROM requests WHERE id = v_request_id;
  END IF;

  v_detail := format('Recibiste una cotización de %s para el Pedido #%s',
    v_provider_name, COALESCE(v_req_num::text, LEFT(NEW.rfq_id::text, 8)));

  FOR v_usr IN
    SELECT user_id FROM user_roles
    WHERE company_id = v_company_id AND role IN ('compras', 'admin')
  LOOP
    INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
    VALUES (v_company_id, v_usr.user_id, 'quote_received',
      format('Cotización de %s recibida', v_provider_name),
      jsonb_build_object(
        'rfq_id', NEW.rfq_id,
        'quote_id', NEW.id,
        'detail_message', v_detail
      ));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_quote_received ON quotes;
CREATE TRIGGER trg_notify_quote_received
  AFTER INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION fn_notify_quote_received();

-- ================================================================
-- 4. Purchase order issued → notify provider users
-- ================================================================

CREATE OR REPLACE FUNCTION fn_notify_po_issued()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total    TEXT;
  v_rfq_short TEXT;
  v_usr      RECORD;
BEGIN
  v_total     := '$' || to_char(NEW.total_amount, 'FM999,999,999.00');
  v_rfq_short := COALESCE(LEFT(NEW.rfq_id::text, 8), 'N/A');

  FOR v_usr IN
    SELECT user_id FROM provider_users
    WHERE provider_id = NEW.provider_id AND active = TRUE
  LOOP
    INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
    VALUES (NEW.company_id, v_usr.user_id, 'po_issued',
      format('OC recibida por %s', v_total),
      jsonb_build_object(
        'po_id', NEW.id,
        'rfq_id', NEW.rfq_id,
        'detail_message', format('Has recibido una Orden de compra por %s para el RFQ #%s', v_total, v_rfq_short)
      ));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_po_issued ON purchase_orders;
CREATE TRIGGER trg_notify_po_issued
  AFTER INSERT ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION fn_notify_po_issued();
