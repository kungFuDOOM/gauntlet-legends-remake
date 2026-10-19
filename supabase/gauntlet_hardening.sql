-- Security hardening for the Gauntlet Legends global leaderboard (migration "gauntlet_hardening"). Backwards compatible with the shipped client.
-- search_path '' + schema-qualified objects; RPC-only reads; execute for anon only; server-side caps that don't depend on the client token;
-- score plausibility vs furthest level (generous: real quests score well under this); a win is only accepted at/near the last level (16).
create index if not exists gauntlet_scores_created_idx on public.gauntlet_scores (created_at desc);
create index if not exists gauntlet_scores_name_idx on public.gauntlet_scores (lower(name), created_at desc);
create index if not exists gauntlet_scores_distinct_idx on public.gauntlet_scores (lower(name), score desc, created_at asc) where not hidden;
revoke all on public.gauntlet_scores from anon, authenticated;

create or replace function public.submit_gauntlet_score(p_name text, p_score int, p_cls text, p_level int, p_won boolean, p_token text)
returns json language plpgsql security definer set search_path = '' as $$
declare v_name text := pg_catalog.btrim(coalesce(p_name,'')); v_hash text; v_id bigint; v_rank int;
begin
  if v_name !~ '^[A-Za-z0-9 _.-]{3,12}$' then raise exception 'bad name'; end if;
  if p_score is null or p_score < 0 or p_score > 10000000 then raise exception 'bad score'; end if;
  if p_cls is null or p_cls !~ '^[a-z]{3,16}$' then raise exception 'bad class'; end if;
  if p_level is null or p_level < 0 or p_level > 16 then raise exception 'bad level'; end if;
  if p_token is null or pg_catalog.char_length(p_token) < 16 or pg_catalog.char_length(p_token) > 64 then raise exception 'bad token'; end if;
  -- plausibility: stage points scale up to x2.5 and a whole quest is far below 400k per stage reached (hub/level 0 counts as 1)
  if p_score > 400000 * greatest(p_level, 1) then raise exception 'bad score'; end if;
  if coalesce(p_won,false) and p_level < 15 then raise exception 'bad level'; end if;
  v_hash := pg_catalog.md5(p_token);
  if exists (select 1 from public.gauntlet_scores where client_hash = v_hash and created_at > now() - interval '15 seconds') then raise exception 'slow down'; end if;
  if (select pg_catalog.count(*) from public.gauntlet_scores where client_hash = v_hash and created_at > now() - interval '1 hour') >= 20 then raise exception 'rate limit'; end if;
  -- caps that clearing the client token does not bypass
  if (select pg_catalog.count(*) from public.gauntlet_scores where client_hash = v_hash) >= 200 then raise exception 'rate limit'; end if;
  if (select pg_catalog.count(*) from public.gauntlet_scores where pg_catalog.lower(name) = pg_catalog.lower(v_name) and created_at > now() - interval '1 day') >= 30 then raise exception 'rate limit'; end if;
  if (select pg_catalog.count(*) from public.gauntlet_scores where created_at > now() - interval '1 minute') >= 60 then raise exception 'busy'; end if;
  if (select pg_catalog.count(*) from public.gauntlet_scores where created_at > now() - interval '1 hour') >= 600 then raise exception 'busy'; end if;
  if (select pg_catalog.count(*) from public.gauntlet_scores) >= 50000 then raise exception 'busy'; end if;
  insert into public.gauntlet_scores(name, score, cls, level, won, client_hash) values (v_name, p_score, p_cls, p_level::smallint, coalesce(p_won,false), v_hash) returning id into v_id;
  select pg_catalog.count(*)+1 into v_rank from (select distinct on (pg_catalog.lower(name)) score from public.gauntlet_scores where not hidden order by pg_catalog.lower(name), score desc) b where b.score > p_score;
  return pg_catalog.json_build_object('id', v_id, 'rank', v_rank);
end $$;

create or replace function public.top_gauntlet_scores(p_limit int default 10)
returns table(id bigint, name text, score int, cls text, level smallint, won boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.score, t.cls, t.level, t.won, t.created_at from (
    select distinct on (pg_catalog.lower(s.name)) s.id, s.name, s.score, s.cls, s.level, s.won, s.created_at from public.gauntlet_scores s where not s.hidden order by pg_catalog.lower(s.name), s.score desc, s.created_at asc
  ) t order by t.score desc, t.created_at asc limit least(greatest(coalesce(p_limit,10),1),50);
$$;

revoke execute on function public.submit_gauntlet_score(text,int,text,int,boolean,text) from public, anon, authenticated;
revoke execute on function public.top_gauntlet_scores(int) from public, anon, authenticated;
grant execute on function public.submit_gauntlet_score(text,int,text,int,boolean,text) to anon;
grant execute on function public.top_gauntlet_scores(int) to anon;

-- Legacy overload from an earlier leaderboard design (stage/seconds/fingerprint, table public.scores, 0 rows). No game calls it
-- (neither Gauntlet nor Harambe); closed to clients. Re-grant with: grant execute on function public.submit_score(text,int,int,int,text,text) to anon;
revoke execute on function public.submit_score(text,int,int,int,text,text) from public, anon, authenticated;
