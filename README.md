# Banco de Questões – Carreiras Jurídicas

Plataforma de estudo com **5.810 questões** de provas de carreiras jurídicas, com comentário em todas elas, simulado cronometrado e acompanhamento de desempenho. Roda só no navegador, sem servidor e sem backend.

**Acesse:** https://kl-projects-1602.github.io/banco-questoes-juridicas/

## Modos
- **Treino** — filtra por fonte, disciplina, tema e quantidade; correção na hora ou no fim.
- **Rodada** — sorteia metade do conjunto filtrado; pode excluir o que já foi acertado.
- **Prova completa** — simulado ENAM na distribuição do edital (16/10/6/6/12/12/6/12), ou uma prova real do ENAM/FGV; cronômetro, marcação de dúvida, mapa de questões, nota de corte.
- **Desempenho** — acertos por disciplina e tema, histórico de sessões, treino dos erros.

O histórico fica no `localStorage` do próprio navegador. Use *Exportar/Importar histórico* para levá-lo a outro computador.

## Fontes
| Fonte | Questões |
|---|---|
| FGV – carreiras jurídicas (jan/2024 a nov/2026) | 2.859 |
| Apostilas – questões de outras bancas | 2.391 |
| ENAM (2024.1 a 2026.1, com a reaplicação) | 480 |
| Autorais, no estilo FGV | 80 |

Gabaritos oficiais em 5.700 questões; 63 anuladas (contadas como acerto, conforme a FGV); 47 resolvidas e marcadas como resposta não oficial. Toda questão tem enunciado completo, resposta e comentário. Citações de lei, súmula, tema e resolução foram conferidas em fonte oficial (Planalto, STF, STJ, CNJ) onde há a marca ✔ nas fontes do comentário.

## Por que as questões podem ser reproduzidas
Provas de concurso público são atos oficiais, excluídos da proteção autoral pelo art. 8º, IV, da Lei 9.610/1998. O TJ-SP já decidiu que questões de prova não têm proteção de direito autoral nem constituem base de dados protegida. Os comentários são de elaboração própria.

## Indexação
O site não é indexado por mecanismos de busca: a página declara `robots: noindex, nofollow` e o repositório traz um `robots.txt` com `Disallow`. O link continua público para quem o tiver.

## Estrutura
```
index.html      página
app.js          aplicação (JS puro, sem dependências)
estilo.css      estilos, com tema claro e escuro
banca.js        regras do exame: tempo, distribuição, nota de corte
questoes.js     banco de questões
comentarios.js  comentários, base legal e fontes conferidas
```
Para adaptar a outro concurso, altere apenas `banca.js`.
