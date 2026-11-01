// kaupet_open: bedriftsprofiler er ikke tilgjengelige.
export async function conversationOrganizations(_ids: (string | null | undefined)[]) {
  return new Map<string, { name: string; avatarUrl: string | null }>();
}

export async function withOrganizationSellers<
  Row extends {
    seller_id: string;
    listing: object | null | undefined;
    seller: {
      id: string;
      display_name: string;
      avatar_url: string | null;
      deleted_at: string | null;
    } | null;
  },
>(rows: Row[], _userId: string): Promise<Row[]> {
  return rows;
}
