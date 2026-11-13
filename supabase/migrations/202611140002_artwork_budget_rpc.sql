create or replace function public.reserve_artwork_budget(p_variations integer)
returns table(reserved_calls integer, usage_month date)
language plpgsql security definer set search_path = '' as $$
declare v_budget public.artwork_budgets%rowtype; v_month date := date_trunc('month', now())::date; v_calls integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_variations < 1 or p_variations > 3 then raise exception 'Choose one to three variations.'; end if;
  v_calls := p_variations * 2;
  select * into v_budget from public.artwork_budgets where id = true for update;
  if not v_budget.enabled then raise exception 'AI generation is disabled by the administrator.'; end if;
  if p_variations > v_budget.max_variations_per_request then raise exception 'Variation limit exceeded.'; end if;
  if v_budget.usage_month <> v_month then v_budget.used_calls := 0; end if;
  if v_budget.used_calls + v_calls > v_budget.max_calls_per_month then raise exception 'Monthly Gemini call budget reached.'; end if;
  update public.artwork_budgets set used_calls = v_budget.used_calls + v_calls, usage_month = v_month, updated_at = now() where id = true;
  return query select v_calls, v_month;
end;
$$;
revoke all on function public.reserve_artwork_budget(integer) from public;
grant execute on function public.reserve_artwork_budget(integer) to authenticated;

create or replace function public.finalize_artwork_budget(p_reserved integer, p_actual integer, p_usage_month date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_reserved < 0 or p_actual < 0 or p_actual > p_reserved then raise exception 'Invalid budget adjustment.'; end if;
  update public.artwork_budgets set used_calls = greatest(0, used_calls - (p_reserved - p_actual)), updated_at = now()
  where id = true and usage_month = p_usage_month;
end;
$$;
revoke all on function public.finalize_artwork_budget(integer,integer,date) from public;
grant execute on function public.finalize_artwork_budget(integer,integer,date) to authenticated;
