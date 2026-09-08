ALTER TABLE customer_movements DROP CONSTRAINT customer_movements_phase_check;
ALTER TABLE customer_movements ADD CONSTRAINT customer_movements_phase_check
 CHECK (phase IN ('paused','fenced','copied','verified','returning','activated','completed','cancelled','superseded'));
