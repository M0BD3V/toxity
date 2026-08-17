# Toxity — guia inicial de marca

Pronúncia: **Tok-si-ri**  
Assinatura de campanha: **Use Toxity sem ser tóxico, consegue?**

## Conceito

A Pulse Mask é uma máscara de gás frontal, geométrica e amigável. Seus visores arredondados dão proximidade ao símbolo; o respirador compacto e os filtros laterais preservam a leitura de máscara sem estética militar. O nome é provocativo, mas a experiência da marca deve ser moderna, segura e acolhedora.

## Paleta

| Papel | Cor |
| --- | --- |
| Fundo principal | `#0D0F14` |
| Superfície | `#171A22` |
| Roxo principal | `#8B5CF6` |
| Ciano de destaque | `#22D3EE` |
| Texto principal | `#F5F7FA` |
| Texto secundário | `#9CA3AF` |
| Sucesso | `#34D399` |
| Erro | `#FB7185` |

O roxo é dominante. O ciano deve ocupar áreas pequenas, principalmente visores e indicadores. Gradientes são permitidos apenas em campanhas, nunca como requisito para reconhecer o símbolo.

## Composições

- `toxity-symbol.svg`: símbolo mestre transparente para produto e ícone.
- `toxity-logo-horizontal.svg`: composição principal com símbolo e nome.
- `toxity-symbol-mono.svg`: versão de uma cor para impressão e tamanhos restritos.
- `toxity-campaign-lockup.svg`: composição promocional com a assinatura; não substitui o logo principal.

## Margem e tamanho mínimo

- Reserve ao redor do símbolo uma margem mínima equivalente a 20% de sua largura.
- Na composição horizontal, use como margem a altura da letra minúscula do nome.
- Símbolo colorido: mínimo de 24 px. Em 16 px, prefira a versão monocromática.
- Logo horizontal digital: mínimo de 140 px de largura.
- A assinatura não deve aparecer quando a composição tiver menos de 600 px de largura.

## Fundos

- Preferencial: fundo `#0D0F14`.
- Fundo claro: use branco ou `#F5F7FA`, preservando o interior grafite do símbolo.
- Fundo transparente: certifique-se de que haja contraste suficiente; não aplique sobre fotografias visualmente carregadas.

## Usos incorretos

- Não alterar as proporções, inclinar ou distorcer a máscara.
- Não trocar roxo e ciano de posição.
- Não adicionar caveiras, fumaça, capuz, armas ou símbolos de risco.
- Não inserir letras escondidas na máscara.
- Não aplicar contornos, sombras ou brilhos que prejudiquem tamanhos pequenos.
- Não aproximar o símbolo da silhueta de controle usada pelo Discord.
- Não anexar permanentemente a assinatura ao logo principal.

## Exportação

Execute `node scripts/export-brand-assets.cjs` com o pacote `sharp` disponível e depois `python scripts/build-ico.py` com Pillow. Os PNGs e ícones são derivados dos SVGs mestres; edite sempre o vetor e regenere os formatos rasterizados.

## Status

Esta é a identidade inicial para uso no protótipo. Antes do lançamento público, faça busca de marca, domínio e similaridade visual, além de uma revisão profissional de curvas e espaçamentos.
