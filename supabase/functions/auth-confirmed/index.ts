import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export default {
  fetch: () => new Response(
    "TOXITY\n\nE-mail confirmado com sucesso.\n\nSua conta está pronta. Agora abra a Toxity no computador e faça login.",
    { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
  ),
};
