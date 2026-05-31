# Delta for Deposito Reception — DEFERRED to #8b

> **Deferred.** Consolidated-merchandise reception (distributing received units per obra/requirement, by urgency, with partial deliveries) is **NOT in the núcleo** (`consolidacion-requerimientos`). The núcleo captures the traceability (`rfq_item_sources` / `rfq_requests`) that this distribution will consume.
>
> When `#8b` is started, this delta will specify: on reception of a consolidated OC, split the received quantity back to each source `request_item` per `rfq_item_sources`, resolve multi-provider/partial cases, and respect per-source urgency ordering on shortfall — per Reporte 1805 "Recepción de mercadería consolidada".
>
> No requirements are active in this change.
