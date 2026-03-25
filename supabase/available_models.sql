create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.available_models (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_key text not null unique,
  display_name text not null,
  description text null,
  supports_council boolean not null default true,
  supports_chairman boolean not null default true,
  is_active boolean not null default true,
  is_free boolean null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.available_models
add column if not exists is_free boolean null;

drop trigger if exists set_available_models_updated_at on public.available_models;

create trigger set_available_models_updated_at
before update on public.available_models
for each row
execute function public.set_updated_at();

insert into public.available_models (
  provider,
  model_key,
  display_name,
  description,
  supports_council,
  supports_chairman,
  is_active,
  is_free,
  sort_order,
  metadata
) values
  (
    'openrouter',
    'openrouter:openai/gpt-5-mini',
    'GPT-5 Mini',
    'OpenRouter GPT-5 Mini',
    true,
    true,
    true,
    false,
    10,
    '{}'::jsonb
  ),
  (
    'openrouter',
    'openrouter:google/gemini-2.5-flash-lite',
    'Gemini 2.5 Flash Lite',
    'OpenRouter Gemini 2.5 Flash Lite',
    true,
    true,
    true,
    false,
    20,
    '{}'::jsonb
  ),
  (
    'codex',
    'codex:local',
    'Codex Local',
    'Local Codex app-server provider',
    true,
    true,
    true,
    false,
    30,
    '{}'::jsonb
  )
on conflict (model_key) do update
set
  provider = excluded.provider,
  display_name = excluded.display_name,
  description = excluded.description,
  supports_council = excluded.supports_council,
  supports_chairman = excluded.supports_chairman,
  is_active = excluded.is_active,
  is_free = excluded.is_free,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

update public.available_models
set is_free = case
  when provider = 'openrouter' and lower(model_key) like '%:free' then true
  when provider = 'codex' then false
  else is_free
end
where is_free is null;
