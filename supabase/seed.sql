-- TE Fund: the roster, and where the rotation currently stands.
--
-- Rotation is alphabetical by given name:
--   Thu -> Tien -> Tuan -> Viet -> Vu -> Yen -> back to Thu.
-- Tuan Tran is holding the cash as of September 2026.

insert into members (email, full_name, given_name, family_name) values
  ('thu.vu@timeedit.com',   'Thu Vu',    'Thu',  'Vu'),
  ('tien.lai@timeedit.com', 'Tien Lai',  'Tien', 'Lai'),
  ('tuan.tran@timeedit.com','Tuan Tran', 'Tuan', 'Tran'),
  ('viet.lam@timeedit.com', 'Viet Lam',  'Viet', 'Lam'),
  ('vu.vuong@timeedit.com', 'Vu Vuong',  'Vu',   'Vuong'),
  ('yen.vu@timeedit.com',   'Yen Vu',    'Yen',  'Vu')
on conflict (email) do nothing;

insert into months (month_start, holder_id)
select date '2026-09-01', id from members where email = 'tuan.tran@timeedit.com'
on conflict (month_start) do update set holder_id = excluded.holder_id;
