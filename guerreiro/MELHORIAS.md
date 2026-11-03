# O Atlas Perdido: novo Guerreiro e sugestões de visual

## Por que o visual atual incomoda

Analisei os sprites do guerreiro dentro de `O Atlas Perdido - ARPG.html`:

1. **Três personagens diferentes se revezam na tela.** A caminhada (`warnw_walk8_*`) não tem escudo nem costelas no peito. O ataque (`warra*`) tem escudo e costelas. O retrato tem outra proporção. A cada troca de animação o herói "muda de roupa".
2. **Só existe uma direção real.** O código espelha o sprite (`flip`) para fingir as outras. Por isso o escudo troca de braço quando o herói vira, e de costas ele aparece de frente.
3. **As escalas são misturadas.** Cada folha de sprites usa um fator diferente (`125/239`, `125/252`, `118`, `100`…), e o corpo "pulsa" de tamanho entre as animações.
4. **Há poucos quadros e nenhuma física.** Os ataques têm 4 a 6 quadros, a capa é desenhada parada e não existe esquiva nem morte próprias do guerreiro.
5. **As imagens são de baixa resolução e pesadas.** O arquivo tem 10,7 MB, quase tudo em imagens embutidas.

## O que foi feito: Guerreiro Ósseo procedural (2.5D)

Ficha | Valor
---|---
Arquivo | `guerreiro/guerreiro-osseo.js` (~45 KB, sem nenhuma imagem)
Demonstração | `guerreiro/index.html`
Técnica | Esqueleto 3D real (IK de dois ossos) projetado no **mesmo isométrico 2:1 do jogo**, pintado em canvas com volumes sombreados, contorno de tinta e grão de pintura
Direções | 360° contínuos (não são 8 sprites)
Paleta | A mesma do jogo: `--bone #e8dcc0`, `--gold #b98a45`, `--blood #8a1620`, `--iron #3b3335`

**O design segue o tema anatômico do jogo.** O elmo é um crânio com crista de vértebras e olhos acesos, que ficam vermelhos com a Fúria. O peitoral é uma caixa torácica sobre a couraça de ferro, com esterno e cinto dourado de fivela-crânio. As ombreiras de osso têm chifres. As joelheiras são **patelas** (ligação com a *Investida Patelar*). A espada é um **fêmur**, com o pomo em forma de cabeça do fêmur, fio serrilhado e canal de medula. O escudo é uma rodela carmesim com raios de osso e um crânio no centro. A capa e o tabardo são de tecido com **física de verdade**: balançam com o vento e com a inércia do movimento.

**Cada habilidade da classe tem sua animação:**

Habilidade | Animação
---|---
Golpe Cortical | Combo de 3 golpes (diagonal, revés e estocada), com rastro na arma
Esmagar Trabecular | Ergue a espada, pula e crava no chão. Gera onda de choque, rachaduras e estilhaços de osso
Investida Patelar | Escudo à frente, corpo inclinado e joelho alto
Brado do Periósteo | Braços abertos, aura vermelha e olhos em brasa
Redemoinho Articular | Giro contínuo com a lâmina horizontal
Esquiva, dano e morte | Rolamento, recuo e queda para trás

O brilho de raridade da arma (Comum, Mágico, Raro, Lendário) usa as cores de `RARITY` do jogo.

## Como ligar no jogo

1. Cole o conteúdo de `guerreiro-osseo.js` em um `<script>` antes do script principal do jogo.
2. No início de `drawPlayer()`, logo depois da linha `const fl = …, hurt = …;`, insira:

```js
if (P.cls.id === 'guerreiro' && window.GuerreiroOsseo && !P.dead) {
  const now = performance.now(), dt = Math.min(.05, (now - (window.__goT || now)) / 1000); window.__goT = now;
  window.__go = window.__go || GuerreiroOsseo.create({ scale: 72 });
  __go.syncFromGame(P, G, dt);
  const w = P.equip.arma;
  __go.draw(ctx, x, y, { scale: 72, hurt, alpha: P.iframes > 0 && !P.roll ? .7 : 1,
    rarity: w && w.rarity >= 1 ? RARITY[w.rarity].color : null });
  return;
}
```

`syncFromGame` lê `P.artAction`, `P.combo`, `P.roll`, `P.hurtT`, `P.dead`, `P.walk` e `P.dirX/dirY`, que já existem no jogo. A escala `72` deixa o herói com cerca de 118 px de altura, o mesmo tamanho do sprite atual.

## Sugestões para o resto do visual (em ordem de impacto)

1. **Unificar o estilo dos três heróis.** Usar o mesmo sistema procedural para o Arqueiro (rádio/ulna como arco, aljava de costelas) e o Mago (cajado de coluna vertebral, manto de membrana). Com os três no mesmo motor, a proporção e a luz ficam idênticas.
2. **Iluminação dinâmica nos personagens.** O módulo já tem `LIGHT_W`. Basta passar a posição da fogueira ou do lampião mais próximo para a luz do herói mudar de lado ao andar pelo mapa.
3. **Reduzir o arquivo de 10,7 MB.** Os sprites do guerreiro (`war*`, `warnw*` e o retrato) podem sair. O retrato da seleção de classe pode ser gerado pelo próprio módulo, desenhando o herói grande em um canvas.
4. **Inimigos com o mesmo contorno de tinta.** Aplicar o contorno de silhueta e o grão de pintura (função `draw`) aos sprites dos inimigos para que tudo pareça da mesma mão.
5. **Mais peso nos golpes.** Somar ao `hitstop` que já existe um leve zoom e tremor de câmera no `impact` do Esmagar. O módulo emite o evento: `GuerreiroOsseo.create({ on: (ev, nome) => … })`.
6. **Equipamento visível.** Trocar a cor do tabardo e da capa conforme a armadura equipada, e o material da espada (osso, sangue, nervo) conforme a variante do ícone (`w_blade1_blood`, `w_axe_nerve`…).
7. **Leitura em combate.** Manter o anel dourado sob o herói e dar a cada habilidade uma cor de rastro própria (Fúria = vermelho, Brado = dourado).
