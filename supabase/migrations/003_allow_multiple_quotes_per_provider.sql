-- Allow providers to submit multiple quotes for the same RFQ
ALTER TABLE quotes DROP CONSTRAINT quotes_rfq_id_provider_id_key;
