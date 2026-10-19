-- Backend for the global leaderboard (Supabase project "gauntlet-legends", table public.gauntlet_scores).
-- Public clients get: read of public columns, and two RPCs. No direct writes. No wallet or contact data is stored.
create table public.gauntlet_scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 3 and 12 and name ~ '^[A-Za-z0-9 _.-]+$'),
  score integer not null check (score between 0 and 10000000),
  cls text not null check (cls ~ '^[a-z]{3,16}$'),          -- hero class
  level smallint not null check (level between 0 and 16),    -- furthest stage reached (0 = hub)
  won boolean not null default false,
  client_hash text not null,             -- md5 of a random per-browser token, for rate limiting; not readable by anon
  hidden boolean not null default false, -- moderation switch
  created_at timestamptz not null default now()
);
create index gauntlet_scores_score_idx on public.gauntlet_scores (score desc) where not hidden;
create index gauntlet_scores_client_idx on public.gauntlet_scores (client_hash, created_at desc);
alter table public.gauntlet_scores enable row level security;
revoke all on public.gauntlet_scores from anon, authenticated;
-- (no policies: anon/authenticated have no direct table access; everything goes through the RPCs below)

create or replace function public.submit_gauntlet_score(p_name text, p_score int, p_cls text, p_level int, p_won boolean, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name,'')); v_hash text; v_id bigint; v_rank int;
begin
  if v_name !~ '^[A-Za-z0-9 _.-]{3,12}$' then raise exception 'bad name'; end if;
  if p_score is null or p_score < 0 or p_score > 10000000 then raise exception 'bad score'; end if;
  if p_cls is null or p_cls !~ '^[a-z]{3,16}$' then raise exception 'bad class'; end if;
  if p_level is null or p_level < 0 or p_level > 16 then raise exception 'bad level'; end if;
  if p_token is null or char_length(p_token) < 16 or char_length(p_token) > 64 then raise exception 'bad token'; end if;
  v_hash := md5(p_token);
  if exists (select 1 from gauntlet_scores where client_hash = v_hash and created_at > now() - interval '15 seconds') then raise exception 'slow down'; end if;
  if (select count(*) from gauntlet_scores where client_hash = v_hash and created_at > now() - interval '1 hour') >= 20 then raise exception 'rate limit'; end if;
  insert into gauntlet_scores(name, score, cls, level, won, client_hash) values (v_name, p_score, p_cls, p_level::smallint, coalesce(p_won,false), v_hash) returning id into v_id;
  select count(*)+1 into v_rank from (select distinct on (lower(name)) score from gauntlet_scores where not hidden order by lower(name), score desc) b where b.score > p_score;
  return json_build_object('id', v_id, 'rank', v_rank);
end $$;

-- one row per player name (their best), best first
create or replace function public.top_gauntlet_scores(p_limit int default 10)
returns table(id bigint, name text, score int, cls text, level smallint, won boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.score, t.cls, t.level, t.won, t.created_at from (
    select distinct on (lower(name)) id, name, score, cls, level, won, created_at from gauntlet_scores where not hidden order by lower(name), score desc, created_at asc
  ) t order by t.score desc, t.created_at asc limit least(greatest(coalesce(p_limit,10),1),50);
$$;

revoke execute on function public.submit_gauntlet_score(text,int,text,int,boolean,text) from public;
revoke execute on function public.top_gauntlet_scores(int) from public;
grant execute on function public.submit_gauntlet_score(text,int,text,int,boolean,text) to anon, authenticated;
grant execute on function public.top_gauntlet_scores(int) to anon, authenticated;
