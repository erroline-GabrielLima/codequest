# CodeQuest

Frontend estático em português para desafios semanais. Inclui cadastro e login por e-mail, seleção de perfis por conta e uma tela de desafio.

## Ativar autenticação

1. Crie um projeto Supabase para o CodeQuest. Não precisa usar o servidor do Minecraft.
2. No Supabase, abra o SQL Editor e execute [`supabase/schema.sql`](supabase/schema.sql). A tabela e as políticas permitem que cada conta veja e altere somente os próprios perfis.
3. Em Project Settings → API, copie a Project URL e a chave publishable (`sb_publishable_...`) para `supabase-config.js`.
4. No Authentication → URL Configuration, adicione a URL do site em Site URL e Redirect URLs.
5. Sirva estes arquivos por HTTP/HTTPS e abra `index.html`. Para e-mail de confirmação em produção, configure o provedor de e-mail em Authentication.

O arquivo de configuração usa somente valores públicos. Nunca use a chave `service_role` ou uma secret key no navegador.

## Funcionamento

- Pessoas criam uma conta com e-mail e senha; o Supabase pode pedir confirmação do e-mail conforme as configurações do projeto.
- Cada conta possui um único perfil, criado automaticamente no primeiro acesso.
- O desafio exibido é um exemplo inicial; respostas ficam como rascunhos locais neste MVP.
- O placar comunitário ainda não compartilha resultados entre contas.
- O site não executa código submetido.

`supabase-js` é carregado como módulo ES pelo CDN esm.sh. O app não precisa de servidor próprio nem de dependências locais.
