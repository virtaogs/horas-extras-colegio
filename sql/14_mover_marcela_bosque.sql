-- Move Marcela Jesus Santos Cordeiro (CPF 557.871.788-82) do Horto para
-- o Bosque — ela já estava cadastrada, só faltava a unidade certa.

update public.colaboradores
set coordenador_id = (select id from public.coordenadores where setor = 'Bosque'),
    setor = 'Bosque'
where matricula = '55787178882';
