/**
 * Deterministic accent colour per feed, so a source keeps the same dot/stripe
 * across reloads without anyone having to pick hex codes in the config.
 */
export function feedColor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0;
	}
	const hue = Math.abs(hash) % 360;
	// Fixed S/L keeps every feed at comparable weight; light-dark() adapts it.
	return `light-dark(hsl(${hue} 62% 40%), hsl(${hue} 58% 66%))`;
}
