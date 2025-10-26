-- Create profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create evolution_instances table
create table public.evolution_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  instance_name text not null unique,
  instance_status text not null default 'creating' check (instance_status in ('creating', 'disconnected', 'connecting', 'connected', 'error')),
  qr_code text,
  phone_number text,
  webhook_url text not null,
  last_qr_update timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.evolution_instances enable row level security;

-- Create function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Create trigger for profiles updated_at
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at_column();

-- Create trigger for evolution_instances updated_at
create trigger update_evolution_instances_updated_at
  before update on public.evolution_instances
  for each row
  execute function public.update_updated_at_column();

-- Create function to handle new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

-- Create trigger to auto-create profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- RLS Policies for profiles
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- RLS Policies for evolution_instances
create policy "Users can view own instance"
  on public.evolution_instances
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own instance"
  on public.evolution_instances
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own instance"
  on public.evolution_instances
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create index for better performance
create index idx_evolution_instances_user_id on public.evolution_instances(user_id);
create index idx_evolution_instances_instance_name on public.evolution_instances(instance_name);