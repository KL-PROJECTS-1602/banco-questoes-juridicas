// Regras do exame usadas na "Prova completa". Para outra banca/concurso, altere só este arquivo.
window.CONFIG = {
  banca: "FGV",
  exame: "ENAM – Exame Nacional da Magistratura",
  tempo_minutos: 300,            // edital ENAM: 5 horas
  total_questoes: 80,
  // Distribuição fixa do edital ENAM (item 8.6)
  distribuicao: {
    "Constitucional": 16,
    "Administrativo": 10,
    "Formação Humanística": 6,
    "Direitos Humanos": 6,
    "Processo Civil": 12,
    "Civil": 12,
    "Empresarial": 6,
    "Penal": 12
  },
  corte_acertos: 56,             // 70% – ampla concorrência (item 9.2)
  corte_acertos_cotas: 40,       // 50% – pessoas negras, indígenas, quilombolas ou com deficiência
  pontuacao: { acerto: 1, erro: 0, branco: 0 },
  anulada_conta_como_acerto: true, // FGV atribui a pontuação da questão anulada a todos
  rodada_percentual: 50          // "Rodada": sorteia metade do conjunto filtrado
};
