# Caixinha e Empréstimos

Caixinha, cotas, empréstimos por parcelas, painel e agenda. Site estático, sem build e sem servidor.
Os dados ficam no aparelho (criptografados quando há PIN) e, se você conectar, também em backup no Google Drive (pasta `save Caixinha`).

## Estrutura
```
index.html          casca da página + política de segurança (CSP)
css/main.css        estilos (folha única: base, repaginação e profundidade; tema claro/escuro, celular e desktop)
js/core.js          lógica pura: validação do estado, migração, cálculos (testável em Node)
js/vault.js         armazenamento local e criptografia em repouso (AES-GCM + PBKDF2)
js/ui.js            diálogos, avisos, teclado de PIN
js/drive.js         backup no Google Drive
js/views.js         telas e ações (Caixinha, Empréstimos, Painel, Agenda, Ajustes)
js/membros.js       aba Membros
js/rifa.js          rifas (área do administrador)
js/app.js           inicialização, bloqueio, backup/importação
js/config.js        ID do cliente Google (opcional)
sw.js               cache para abrir sem internet
tests/core.test.js  testes do núcleo:  node tests/core.test.js
```

## Publicar no GitHub Pages
1. Crie um repositório e envie **todo o conteúdo desta pasta** (menos `tests/`, se quiser).
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. O endereço será `https://SEUUSUARIO.github.io/NOME/`. O PIN e a criptografia só funcionam em **https** (ou `localhost`).
4. No iPhone: abra no Safari → Compartilhar → Adicionar à Tela de Início. Use sempre o mesmo (Safari ou ícone): eles não compartilham dados.

Para testar localmente: `python -m http.server 8765` dentro da pasta e abra `http://localhost:8765`.

## Segurança
- **PIN de 6 dígitos com criptografia de verdade.** Com PIN, os dados são cifrados (AES-GCM, chave derivada do PIN com PBKDF2-SHA-256, 600 mil iterações) e o texto puro é apagado. A chave só existe na memória: ao bloquear, o app descarta os dados da memória e da tela.
- **Bloqueio automático** após 2 minutos fora da tela ou 5 minutos sem uso, e botão de bloquear no topo. Excluir, desfazer pagamento, exportar e remover o PIN pedem o PIN de novo.
- **Esqueci o PIN:** não há recuperação, porque o PIN é a chave. É possível apagar os dados do aparelho e restaurar um backup (arquivo ou Drive).
- **Limite honesto:** um PIN numérico pode ser descoberto por força bruta por quem copiar o armazenamento do aparelho (as 600 mil iterações encarecem isso). A proteção real contra um atacante dedicado é o bloqueio do próprio aparelho.
- **Backups e importação são validados.** Tudo que entra (arquivo, Drive, armazenamento) passa por `CX.sanitize()`: tipos, limites e IDs são forçados, chaves perigosas (`__proto__`) são descartadas. Um backup adulterado não consegue injetar HTML/JS.
- **CSP estrita** (sem scripts nem estilos inline; só o próprio site e o login/API do Google), `referrer` desligado e bloqueio de uso dentro de iframes.
- **CSV seguro:** células que começam com `=`, `+`, `-` ou `@` são neutralizadas (injeção de fórmula).
- **Exportar com senha:** gera um arquivo `.cifrado.json` que só abre com a senha escolhida. O arquivo de backup normal contém os dados reais em texto aberto: guarde em lugar seguro.
- **Google Drive:** escopo `drive.file` (o app só vê os arquivos que ele criou); o token fica só na memória. O backup no Drive **não** é cifrado pelo PIN, ele é protegido pela sua conta Google.

## Relatórios
Em Caixinha → Ver relatório: tabela por membro ou mês a mês, com três saídas.
- **PDF (Imprimir / salvar PDF):** faixa verde com a marca, cartões de resumo e tabela. No diálogo de impressão, ative "Gráficos de segundo plano" para sair colorido.
- **Planilha (Excel):** arquivo `.xls` formatado com as mesmas cores, valores em moeda e colunas dimensionadas. Abre no Excel e no LibreOffice. Se o Excel avisar sobre o formato, confirme: é esperado nesse tipo de arquivo.
- **CSV simples:** sem formatação, para importar em outros sistemas.
- **Balanço opcional:** o seletor "Sem balanço / Com balanço" inclui, ao final do PDF e da planilha, o resumo do ano com caixinha, empréstimos e total recebido.

## Membros
Aba **Membros**: cadastro de todas as pessoas da caixinha (nome, apelido, WhatsApp e cotas). Cada membro mostra quantas cotas tem, com − e + para ajustar na hora; tocar no nome edita ou remove. **Cota 0 = só membro** (participa das rifas, mas não aparece nos pagamentos da caixinha). **Adicionar vários** aceita a lista colada, um por linha, no formato `Nome; cotas; WhatsApp` (cotas e WhatsApp são opcionais) e ignora nomes que já existem. Os dados são os mesmos da aba Caixinha: o que muda numa aparece na outra.

## Rifas (área do administrador)
**PIN do administrador:** em Ajustes → Administração → *Definir PIN* (6 dígitos). Ele é pedido toda vez que alguém abre as rifas, é independente do PIN do app e só o hash (sal + PBKDF2) é guardado. Ele não vai para o arquivo de backup e não é restaurado ao importar um backup. Sem o PIN do app, ele protege a tela mas não criptografa os dados.

**Nova rifa:** nome (sugerido como "Rifa de 2026 #01"), total de números (sugerido: cotas dos membros × números por cota, padrão 2), valor por número, data, quantidade de ganhadores (1 a 5) e prêmio de cada posição. Os prêmios já vêm em dinheiro (R$ 500, 250 e 100); para outro tipo de prêmio, escreva o texto no campo (por exemplo "Cesta de Natal"). Em *Mais opções*: números por cota de cada membro (padrão 2), primeiro número (padrão 100), caixinha e se uma pessoa pode ganhar mais de uma vez.

**Vendas por membro:** Cada membro tem como meta vender **cotas × 2 números** (por exemplo, quem tem 1 cota vende 2 números). *Atribuir número* registra quem vendeu, o número e quem comprou (o próprio membro ou pessoa externa); a lista de vendedores mostra o andamento ("Ana (1 de 2)") e já sugere quem ainda tem meta. *Atribuir e próxima* mantém o vendedor para lançar vários seguidos. O *Histórico de vendas por membro* agrupa por quem vendeu e mostra o total de pendentes. *Disponíveis (imagem)* gera um PNG com os números livres: no celular abre o menu de compartilhar (WhatsApp), no computador baixa o arquivo.

## Rifas: detalhes
Entrada discreta no fim de **Ajustes → Administração → Rifas**, fora das abas principais. Com PIN ativo, abrir a área pede o PIN; ao bloquear o app, ela fecha e volta para Ajustes.
- **Sorteio:** "Iniciar sorteio" trava os números e gera um código de conferência (SHA-256 da lista). Sorteio sem viés (`crypto.getRandomValues` com rejeição), nunca repete número e, por padrão, nem pessoa. Cada ganhador é gravado no instante do sorteio: fechar a tela não refaz o resultado. Só "Anular sorteio" (com PIN) apaga os ganhadores.
- **Também:** tocar num número para atribuir/liberar, compartilhar no WhatsApp (livres, por pessoa, resultado), imprimir/PDF, encerrar sem sorteio, excluir com desfazer. As rifas entram no backup e na restauração, e backups antigos sem rifas continuam abrindo.

## Nova aparência (ativa)

`css/main.css` é a folha única (antes eram app.css, v2.css e v3.css, fundidos na mesma ordem de cascata). Tem três seções: base, repaginação (tema escuro grafite com acento menta, nav com pílula, diálogos com alça) e profundidade (cartões em camadas, resumo com malha de luz, nav flutuante no celular), mais correções de acessibilidade no fim.
- **Visual anterior:** uma cópia completa do layout antigo está em `../caixinha-app-layout-anterior`.
- Revisado em 440 e 320 pt (todas as abas, claro e escuro, PIN, diálogos). Ainda falta conferir em iPhone de verdade o vidro da nav e a pílula do ícone.

## Histórico e proteções
- **Mês de entrada:** cada membro novo guarda o mês em que entrou (o mês aberto na caixinha). Meses anteriores não contam cota nem pendência para ele. Membros antigos, sem essa data, continuam valendo para todos os meses.
- **Avisos antes de mudar o passado:** alterar cotas de quem já tem pagamentos, o valor da cota ou remover um membro pede confirmação, porque os totais antigos são recalculados. Para tirar alguém só das cobranças, zere as cotas.
- **Hoje/Agenda** mostram também até 3 meses anteriores em aberto (só meses em que já houve lançamentos).
- **"Todos pagos"** marca só quem ainda não pagou; quem pagou com atraso ou dividiu a cota não é alterado.
- **Backup:** aviso em Ajustes quando passam 10 dias sem exportar e sem Drive em dia.

## Visual v3 "Profundidade" (ativo)
Para limpar regras duplicadas, mexa por componente em passos pequenos e suba a versão do cache em `sw.js` a cada mudança.

## Ativar o Google Drive
1. Em console.cloud.google.com, crie um projeto com a **Google Drive API** ativa e o escopo `drive.file`.
2. Em Credenciais → ID do cliente OAuth (Aplicativo da Web), confira em **Origens JavaScript autorizadas** se existe `https://SEUUSUARIO.github.io` (sem barra no final e sem caminho).
3. No app: Ajustes → Google Drive → cole o ID do cliente → Salvar ID → Conectar.
   Para valer em todos os aparelhos sem colar de novo, escreva o ID em `js/config.js`.
4. **Primeira conexão (ou aparelho vazio):** se já existir backup na pasta, o app pergunta se você quer restaurá-lo ou substituí-lo; ele nunca sobrescreve sozinho. "Restaurar do Drive" lista o arquivo atual e as cópias diárias.
5. A cada alteração (1,5 s depois) o app grava `caixinha-atual.json` e uma cópia por dia. Se o login expirar (cerca de 1 hora), aparece "Backup pendente": toque em Sincronizar agora. Se esse envio falhar, o app tenta de novo a cada 20 minutos enquanto houver alteração pendente e o login do Google estiver ativo.

## Atualizando de uma versão antiga
Os dados são migrados sozinhos ao abrir (membros, pagamentos, multas e empréstimos do modelo antigo viram o modelo de parcelas). Quem já usava PIN de 4 dígitos digita o PIN uma vez e o app passa a cifrar os dados; troque por um PIN de 6 dígitos em Ajustes. A versão antiga do Face ID foi removida: ela só escondia a tela e não protegia os dados.

## Cuidados
- Nunca suba arquivos `caixinha-*.json` para o repositório: têm os dados reais.
- Cada endereço tem seu próprio armazenamento. Ao trocar de endereço, use Exportar/Importar backup ou Restaurar do Drive.
