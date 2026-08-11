-- Atualiza o trigger para a API Lyra na nuvem (depois do deploy no Render).
-- Substitua SEU-HOST e SUA_SENHA.

create or replace function public.lyra_notify_musica_webhook()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://SEU-HOST/api/invb/musicas-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lyra-webhook-secret', 'SUA_SENHA'
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
      'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end
    )
  );
  return coalesce(NEW, OLD);
end;
$$;
