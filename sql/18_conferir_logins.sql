-- Lista colaboradores ATIVOS que ainda não têm login (user_id vazio).
select nome_completo, matricula, cargo, setor
from public.colaboradores
where ativo = true
  and user_id is null
order by nome_completo;
