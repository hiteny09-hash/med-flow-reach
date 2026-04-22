ALTER TABLE public.medicines
ADD COLUMN box_number integer NOT NULL DEFAULT 1
CHECK (box_number IN (1, 2, 3));