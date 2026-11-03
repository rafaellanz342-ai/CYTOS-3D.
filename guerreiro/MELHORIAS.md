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

## Versão 2: texturas, cores e mais polígonos

- **Malhas de verdade.** Cada parte do corpo é um conjunto de polígonos (cerca de 1.000 faces no zoom grande e cerca de 400 no tamanho do jogo): tubos de 16 lados nos membros, esferas em gomos na cabeça, nas ombreiras e nas joelheiras, um tronco de 9 anéis, uma capa 7×8 e um escudo abaulado com aro e verso. A luz é calculada em cada face e há especular no metal e contraluz colorido.
- **Texturas procedurais**, todas desenhadas por código (o arquivo continua sem imagens) e aplicadas face a face com mapeamento UV:

  Textura | Detalhes
  ---|---
  Osso | Poros, veios e rachaduras
  Ferro escovado | Riscos e ferrugem
  Cota de malha | Anéis entrelaçados (braços e saiote)
  Couro | Costura
  Tecido | Trama, dobras, barra bordada e **emblema de ossos cruzados** nas costas da capa
  Couraça | **Costelas, esterno e clavículas em relevo**, espinha nas costas, cinto dourado rebitado com fivela-crânio
  Elmo | Crânio com órbitas, nariz e dentes, e maxilar separado
  Escudo | Raios de osso, aro rebitado e crânio central; verso de tábuas com correias de couro
  Lâmina | Fêmur com canal de medula vermelho e runas gravadas

- **Temas de cor:** Carmesim, Real (roxo e ouro), Peste (verde) e Obsidiana (cinza e prata). Eles mudam o tecido, o escudo, os detalhes dourados, a gema que brilha no cinto e nas ombreiras e a cor do contraluz. Use `heroi.setTheme('real')` ou `GuerreiroOsseo.create({ theme: 'peste' })`.
- **Desempenho:** cada textura é pré-iluminada em 10 níveis de luz, então cada face exige uma única pintura. No tamanho do jogo (escala 72) o nível de detalhe cai automaticamente. Num Chromium sem placa de vídeo, o desenho levou cerca de 13 ms por quadro no tamanho do jogo e cerca de 32 ms no zoom grande. Com placa de vídeo deve ser mais rápido, mas isso não foi medido.

## Versão 3: armas, conjuntos de golpes e visual inspirado em Diablo IV

**Armas.** Escolha com `heroi.setWeapon('espada' | 'lanca' | 'foice', comEscudo)`. Cada arma tem empunhadura, IK das duas mãos e golpes próprios:

Arma | Golpe ×3 (J) | 1 | 2 | 4
---|---|---|---|---
Espada de fêmur | Corte diagonal, revés, estocada | Esmagar Trabecular | Investida Patelar | Redemoinho Articular
Lança vertebral | Estocada, varredura, estocada longa com avanço | Salto Empalador (pulo e cravada) | Carga da Lança | Giro da Haste
Foice longa | Ceifa larga, ceifa ascendente, ceifa giratória 360° | Ceifa do Juízo | Passo Sombrio (avanço e ceifa) | Turbilhão da Ceifa

- **Lança:** sem escudo, é usada com as duas mãos; com escudo, a pegada é por cima, estilo hoplita. A ponta tem fitas de tecido com física.
- **Foice:** sempre usada com as duas mãos, sem escudo.
- **Escudo** (espada e lança): **Golpe de Escudo** (tecla 5) e **Bloquear** (segurar B, `play('bloquear')` / `release('bloquear')`).

**Rosto e armadura:**
- **Rosto:** pele curtida, órbitas fundas com olhos em brasa, sobrancelhas franzidas, nariz modelado, cicatriz costurada e lágrimas de sangue.
- **Elmo:** ferro negro aberto com faixa dourada na testa, protetor nasal, chifres curvos com anéis, crista de vértebras e máscara de maxilar com dentes.
- **Couraça:** placas escuras com arabescos gravados, rebites, desgaste e ferrugem; costelas em relevo; bandoleira de couro com fivela; espinha nas costas; cinto dourado com fivela-crânio.
- **Ombreiras:** três lâminas sobrepostas, chifres de osso e uma caveira com gema.
- **Gola:** pele, com gorjal de placa.
- **Membros:** cotoveleiras e joelheiras com espigões, tassetes em lâminas, braçadeiras e grevas de osso com tiras de couro.
- **Sangue seco:** respingos e escorridos na lâmina, na armadura, na capa e no escudo.

**Desempenho.** De perto, o modelo usa mais polígonos. No tamanho do jogo, os detalhes minúsculos (espigões, crista, nariz) somem sozinhos. Medido num Chromium sem placa de vídeo: cerca de 15 ms por quadro na escala 74 e cerca de 55 ms na escala 150.

## Versão 4: anatomia e imagens geradas no Canva

**Anatomia (código):**
- **Membros:** seção elíptica com ventre muscular deslocado (quadríceps à frente, panturrilha atrás, bíceps e tríceps) e articulações mais estreitas.
- **Tronco:** couraça com **peitorais** e cintura em V.
- **Braços:** à mostra, com pele, veias, cicatrizes e pintura de guerra; deltoide e braçadeira de couro.
- **Pescoço:** de pele, visível sob o elmo.
- **Mãos:** palma enluvada, **4 dedos e polegar** que envolvem o cabo ou a haste (a mão do escudo fecha na alça) e juntas de placa. Os dedos só aparecem de perto.

**Imagens do Canva + código.** O rosto foi **gerado no Canva** (`assets/rosto-canva.jpg`) e está embutido em `guerreiro-imagens.js`. O módulo aplica o retrato no centro da textura da cabeça, com borda esfumada sobre a pele procedural. Os olhos passam a acender só na Fúria. O mesmo mecanismo aceita outras imagens:

```js
GuerreiroOsseo.setImages({ rosto, metal, osso, couro, pele, tecido }); // URL, data URI ou <img>
```

Cada imagem entra como base da textura correspondente, e o código desenha por cima as faixas douradas, os arabescos, as costelas e o sangue. O **tecido** é recolorido para o tema escolhido. Sem imagens, tudo continua 100% procedural.

> As texturas de metal, osso, couro, pele e tecido ainda não foram geradas: o Canva recusou os pedidos por limite de créditos ("cooling down"). Quando o limite liberar, basta gerá-las e adicioná-las em `guerreiro-imagens.js`.

Para o jogo, inclua `guerreiro-imagens.js` **antes** de `guerreiro-osseo.js`.

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

`syncFromGame` também escolhe a arma pelo nome do item equipado (Foice → foice, Lança → lança, o resto → espada). Ele lê `P.artAction`, `P.combo`, `P.roll`, `P.hurtT`, `P.dead`, `P.walk` e `P.dirX/dirY`, que já existem no jogo. A escala `72` deixa o herói com cerca de 118 px de altura, o mesmo tamanho do sprite atual.

## Sugestões para o resto do visual (em ordem de impacto)

1. **Unificar o estilo dos três heróis.** Usar o mesmo sistema procedural para o Arqueiro (rádio/ulna como arco, aljava de costelas) e o Mago (cajado de coluna vertebral, manto de membrana). Com os três no mesmo motor, a proporção e a luz ficam idênticas.
2. **Iluminação dinâmica nos personagens.** O módulo já tem `LIGHT_W`. Basta passar a posição da fogueira ou do lampião mais próximo para a luz do herói mudar de lado ao andar pelo mapa.
3. **Reduzir o arquivo de 10,7 MB.** Os sprites do guerreiro (`war*`, `warnw*` e o retrato) podem sair. O retrato da seleção de classe pode ser gerado pelo próprio módulo, desenhando o herói grande em um canvas.
4. **Inimigos com o mesmo contorno de tinta.** Aplicar o contorno de silhueta e o grão de pintura (função `draw`) aos sprites dos inimigos para que tudo pareça da mesma mão.
5. **Mais peso nos golpes.** Somar ao `hitstop` que já existe um leve zoom e tremor de câmera no `impact` do Esmagar. O módulo emite o evento: `GuerreiroOsseo.create({ on: (ev, nome) => … })`.
6. **Equipamento visível.** Trocar a cor do tabardo e da capa conforme a armadura equipada, e o material da espada (osso, sangue, nervo) conforme a variante do ícone (`w_blade1_blood`, `w_axe_nerve`…).
7. **Leitura em combate.** Manter o anel dourado sob o herói e dar a cada habilidade uma cor de rastro própria (Fúria = vermelho, Brado = dourado).
