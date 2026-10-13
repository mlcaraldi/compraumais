export const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  extracting: "Lendo o arquivo",
  review: "Em revisão",
  committing: "Gravando",
  done: "Concluída",
  failed: "Falhou",
};

export const KIND_LABEL: Record<string, string> = {
  customers: "Clientes",
  products: "Produtos",
  recipes: "Receitas",
  order: "Pedido",
  promotion: "Encarte de ofertas",
};

export const ROW_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceita",
  edited: "Editada",
  rejected: "Rejeitada",
};
