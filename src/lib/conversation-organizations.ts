// kaupet_open: bedriftsprofiler er ikke tilgjengelige.
export async function conversationOrganizations(_ids: (string | null | undefined)[]) {
  return new Map<string, { name: string; avatarUrl: string | null }>();
}

export async function hasOrganizationChatAccess(
  _listing: object | null | undefined,
  _sellerId: string,
  _userId: string,
): Promise<boolean> {
  return false;
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
