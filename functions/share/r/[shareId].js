// =============================================================================
// Cloudflare Pages Function: Dynamic Open Graph & Twitter Card metadata for
// shared reports (/share/r/:shareId).
// Intercepts requests, fetches report title & format from the backend, and
// rewrites HTML tags using Cloudflare's streaming HTMLRewriter so social crawlers
// (Slack, WhatsApp, Twitter/X, LinkedIn, Discord, Telegram, iMessage) display
// a rich preview card with the actual report title and branded cover image.
// =============================================================================

export async function onRequest(context) {
    const { request, params, next } = context;
    const shareId = params.shareId;

    // 1. Fetch default static HTML (index.html)
    const response = await next();

    if (!shareId) {
        return response;
    }

    try {
        // 2. Query AI backend for shared report metadata (with strict 2s timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const metaRes = await fetch(
            `https://api.schemaweaver.dev/api/ai/exports/shared/${encodeURIComponent(shareId)}`,
            {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
            }
        );
        clearTimeout(timeoutId);

        if (!metaRes.ok) {
            return response;
        }

        const data = await metaRes.json();
        const rawTitle = data.title || data.filename || 'Shared Report';
        const format = (data.format || 'report').toLowerCase();
        const formatUpper = format.toUpperCase();

        let typeBadge = '📊';
        let formatLabel = `${formatUpper} Report`;
        if (format === 'pdf') {
            typeBadge = '📄';
            formatLabel = 'PDF Report';
        } else if (format === 'html') {
            typeBadge = '📊';
            formatLabel = 'Interactive Report';
        } else if (format === 'csv' || format === 'xlsx' || format === 'excel') {
            typeBadge = '📑';
            formatLabel = 'Dataset Export';
        } else if (format === 'json') {
            typeBadge = '🧬';
            formatLabel = 'JSON Dataset';
        }

        const pageTitle = `${typeBadge} ${rawTitle} · ${formatLabel} | Schema Weaver`;
        const description = format === 'pdf'
            ? `Executive PDF report "${rawTitle}". Read or download complete PostgreSQL schema analytics, query stats, and AI insights on Schema Weaver Data Explorer.`
            : format === 'html'
            ? `Interactive responsive report "${rawTitle}". Explore live charts, tables, query metrics, and PostgreSQL schema insights on Schema Weaver Data Explorer.`
            : `Shared ${formatLabel} "${rawTitle}". Generated with Schema Weaver Data Explorer for PostgreSQL.`;

        const canonicalUrl = `https://data-explorer.schemaweaver.dev/share/r/${encodeURIComponent(shareId)}`;
        const imageUrl = `https://data-explorer.schemaweaver.dev/og.jpg`;
        const imageAlt = `${rawTitle} — ${formatLabel} on Schema Weaver Data Explorer`;

        // 3. Rewrite metadata tags using Cloudflare's streaming HTMLRewriter
        return new HTMLRewriter()
            .on('title', {
                element(el) {
                    el.setInnerContent(pageTitle);
                },
            })
            .on('meta[name="description"]', {
                element(el) {
                    el.setAttribute('content', description);
                },
            })
            .on('meta[property="og:title"]', {
                element(el) {
                    el.setAttribute('content', pageTitle);
                },
            })
            .on('meta[property="og:description"]', {
                element(el) {
                    el.setAttribute('content', description);
                },
            })
            .on('meta[property="og:url"]', {
                element(el) {
                    el.setAttribute('content', canonicalUrl);
                },
            })
            .on('meta[property="og:image"]', {
                element(el) {
                    el.setAttribute('content', imageUrl);
                },
            })
            .on('meta[property="og:image:secure_url"]', {
                element(el) {
                    el.setAttribute('content', imageUrl);
                },
            })
            .on('meta[property="og:image:alt"]', {
                element(el) {
                    el.setAttribute('content', imageAlt);
                },
            })
            .on('meta[property="og:type"]', {
                element(el) {
                    el.setAttribute('content', 'article');
                },
            })
            .on('meta[name="twitter:title"]', {
                element(el) {
                    el.setAttribute('content', pageTitle);
                },
            })
            .on('meta[name="twitter:description"]', {
                element(el) {
                    el.setAttribute('content', description);
                },
            })
            .on('meta[name="twitter:url"]', {
                element(el) {
                    el.setAttribute('content', canonicalUrl);
                },
            })
            .on('meta[name="twitter:card"]', {
                element(el) {
                    el.setAttribute('content', 'summary_large_image');
                },
            })
            .on('meta[name="twitter:image"]', {
                element(el) {
                    el.setAttribute('content', imageUrl);
                },
            })
            .on('meta[name="twitter:image:alt"]', {
                element(el) {
                    el.setAttribute('content', imageAlt);
                },
            })
            .transform(response);
    } catch (_err) {
        // Fall back gracefully to static index.html if backend is unreachable or timed out
        return response;
    }
}
