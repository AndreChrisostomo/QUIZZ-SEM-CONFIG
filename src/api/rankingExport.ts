export interface RankingExportResult {
  ok: true;
  destination: string;
  files: Array<{
    viewName: string;
    fileName: string;
    rowCount: number;
    sha256: string;
  }>;
}

export async function exportRankingViews() {
  const response = await fetch('/api/rankings/export', {
    method: 'POST',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to export rankings: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<RankingExportResult>;
}
