# Delta for Deposito Reception

## ADDED Requirements

### Requirement: Consolidated OC Traceability

When an OC is generated from a consolidated RFQ, the system MUST populate `purchase_order_items.request_item_id` from `rfq_item_sources` for each line item. The reception flow is unchanged; traceability data is added transparently.

#### Scenario: OC from consolidated RFQ carries request_item_id

- GIVEN an OC is generated from an RFQ with rfq_type=consolidated
- WHEN `generateOC` runs
- THEN each `purchase_order_items` row has `request_item_id` set to the corresponding source request_item from `rfq_item_sources`
- AND the reception panel displays the OC normally with no behavioral change

#### Scenario: OC from standard RFQ unaffected

- GIVEN an OC is generated from an RFQ with rfq_type=open or closed_bid
- WHEN `generateOC` runs
- THEN `purchase_order_items.request_item_id` is NULL (no rfq_item_sources lookup performed)
- AND behavior is identical to pre-consolidation behavior
