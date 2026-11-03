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

Para o jogo, inclua `guerreiro-imagens.js` (e, desde a versão 7, `guerreiro-cabeca.js`) **antes** de `guerreiro-osseo.js`.

## Versão 5: cabeça e corpo com proporções anatômicas

Baseado nas proporções dos livros de anatomia artística e médica: o **cânone heroico de 8 cabeças** (Andrew Loomis, *Figure Drawing for All It's Worth*), o cânone de Paul Richer (*Artistic Anatomy*) e as medidas médias de adulto do *Gray's Anatomy*.

**Corpo (personagem de cerca de 1,85 m):**

Medida | Valor | Referência
---|---|---
Cabeça | 0,23 m | 1/8 da altura
Ombros | ~1,51 m |
Mamilos | | 2 cabeças abaixo do topo
Umbigo | | 3 cabeças abaixo do topo
Púbis | | Metade da altura
Fêmur (coxa) | 0,46 m | ≈ 2 cabeças
Tíbia (canela) | 0,44 m |
Úmero (braço) | 0,32 m | ≈ 1,4 cabeça
Antebraço | 0,27 m | ≈ 1,2 cabeça
Pé | 0,26 m | ≈ 1,15 cabeça, com calcanhar e arco

- **Tronco:** 11 seções medidas, com frente e costas separadas. Tem peitorais, escápulas, sulco da coluna, glúteos, cintura e base do trapézio, sobre os quais fica a couraça.
- **Couraça:** costelas, esterno e clavículas foram reposicionados nas alturas anatômicas.
- **Pescoço:** cerca de 13 cm da vértebra C7 à altura das orelhas, com base larga (trapézio e esternocleidomastoideos).

**Cabeça (não é mais uma esfera).** É uma malha esculpida pela função `headShape` sobre o formato do crânio e da face:
- **Medidas:** comprimento 0,20 m, largura 0,15 m, altura do topo ao queixo 0,23 m.
- **Crânio:** occipital saliente e nuca recolhida.
- **Rosto:** arco superciliar, órbitas, raiz e dorso do nariz até a ponta, asas do nariz, zigomáticos com o sulco abaixo, arcada da boca, fenda dos lábios, sulco mentolabial, queixo largo e ângulo da mandíbula quadrado.
- **Laterais:** têmporas e orelhas.

As feições da geometria ficam nos mesmos pontos do rosto gerado no Canva (olhos, nariz, boca e queixo), então a imagem acompanha o relevo.

**Elmo justo ao crânio:** aberto na frente, com protetores laterais, aba que desce sobre a nuca, faixa dourada na testa e gorjal de placa no pescoço. Os chifres e as ombreiras foram reduzidos para a nova proporção.

**Desempenho:** cerca de 19 ms por quadro na escala do jogo, num Chromium sem placa de vídeo.

## Versão 6: sem elmo, armadura leve e tudo proporcional

- **Cabeça descoberta:** saíram o elmo, os chifres, a crista e o gorjal. Entrou **cabelo curto** como uma casca fina que segue o crânio, com linha do cabelo natural: sobe na testa, entra nas têmporas e desce na nuca. O rosto esculpido e o retrato do Canva ficam à mostra.
- **Pescoço e ombros:** o **trapézio** liga a base do pescoço aos ombros, sem degrau entre o pescoço e a couraça.
- **Armadura mais leve e justa:**
  - ombreira discreta de duas lâminas, sem espigões nem caveira;
  - cotoveleira e joelheira pequenas, sem espigões;
  - um tasset por lado;
  - saiote de malha acompanhando o quadril;
  - sem gola de pele.
- **Pernas:** calça de couro com quadríceps, isquiotibiais e panturrilha; greva fina de osso só sobre a tíbia; **botas de couro** com calcanhar, arco e dedos.
- **Mãos em tamanho real:** palma de cerca de 8,5 cm, falanges finas (o dedo mínimo é menor) e polegar proporcional. O antebraço fica achatado no punho.
- **Equipamento em escala real:** lâmina da espada com 0,88 m e escudo com 56 cm de diâmetro.

## Versão 7: cabeça de um atlas 3D anatômico e cabelo com física

**Base anatômica 3D.** A cabeça agora vem do **modelo-base do MakeHuman (hm08)**, uma malha humana construída sobre referências anatômicas e liberada em **domínio público (CC0)**. O Z-Anatomy e o BodyParts3D não puderam ser baixados desta sessão (bloqueados pela rede). O script `tools/mhhead.py` extrai do `base.obj`:
- **Pele:** da cabeça e do pescoço, com crânio, testa, órbitas, nariz, lábios, queixo, mandíbula e orelhas reais, em dois níveis de detalhe (1.700 faces de perto e 464 no tamanho do jogo, por agrupamento de vértices).
- **Globos oculares:** com textura de esclera, íris, pupila e reflexo especular.
- **Couro cabeludo:** a partir da casca de cabelo do próprio modelo.
- **Encaixe:** a malha é escalonada para 23 cm do topo ao queixo e posicionada na altura das orelhas.
- **Projeção do rosto:** frontal, alinhada aos pontos do retrato do Canva (olhos, nariz, boca e queixo); a parte de trás recebe só pele.
- **Saída:** tudo vai para `guerreiro-cabeca.js` (cerca de 110 KB), carregado antes do módulo. Sem esse arquivo, o módulo volta para a cabeça esculpida da versão 6.

**Cabelo com textura, relevo e física:**
- **Linha do cabelo recortada:** testa livre; desce nas têmporas e na nuca.
- **Cerca de 60 mechas:** fitas que afinam até a ponta, com textura de fios de bordas transparentes e várias tonalidades, criando volume e relevo.
- **Física Verlet por mecha:** inércia do corpo, gravidade e vento; uma mola devolve cada mecha ao penteado (para trás), e a colisão com o crânio impede que atravessem a cabeça. O cabelo balança ao andar, girar e golpear.
- **Desempenho:** no tamanho do jogo, um terço das mechas é desenhado e o couro cabeludo é omitido. Medido: cerca de 18 a 20 ms por quadro num Chromium sem placa de vídeo.

Para o jogo, inclua `guerreiro-imagens.js`, `guerreiro-cabeca.js` e `guerreiro-corpo.js` antes de `guerreiro-osseo.js`.

## Versão 8: corpo inteiro do atlas anatômico, sem armadura

O personagem agora começa **sem armadura**, com o corpo inteiro vindo do mesmo atlas da cabeça: o modelo-base do **MakeHuman hm08 (CC0)**. É a base para reconstruir a armadura por cima depois.

- **Corpo:** `tools/mhbody.py` extrai do `base.obj` o tronco, os braços, as pernas e os pés, sem a cabeça (que vem de `guerreiro-cabeca.js`) e sem as mãos abertas do modelo. As mãos procedurais continuam, com pele e dedos fechados no cabo.
- **Lados:** o modelo é espelhado para casar com o esqueleto do jogo (lado direito = mão da arma).
- **Detalhe:** dois níveis, com 2.118 faces de perto e 654 no tamanho do jogo.
- **Skinning:** 13 ossos (pelve, coluna, pescoço, braços, antebraços, coxas, canelas e pés) usam as articulações reais do modelo (os grupos `joint-*`). Cada vértice tem até 2 ossos com peso: o mais próximo e o vizinho perto das articulações (ombro, cotovelo, quadril, joelho, tornozelo, pescoço).
- **Deformação:** a cada quadro, cada osso leva o vértice da pose de repouso (pose "A" do MakeHuman) para a pose animada. Ele estica só ao longo do eixo do osso, para casar os comprimentos com o esqueleto do jogo.
- **Sombreamento suave:** normais por vértice somadas das faces vizinhas e 16 níveis de luz pré-calculados por textura.
- **Pele e roupa:** textura procedural de pele no atlas UV do MakeHuman (aceita a imagem `pele` via `setImages`) e uma tanga de linho cru como única peça de roupa.
- **Arquivo:** `guerreiro-corpo.js` tem cerca de 140 KB e é carregado antes do módulo.

**Armadura opcional:** `GuerreiroOsseo.create({ armor: true })` ou `heroi.setArmor(true)` volta ao visual da versão 6 (couraça, ombreiras, capa etc.). Na demonstração há o botão **Armadura**, que começa desligado, e o escudo também começa desligado.

**Desempenho:** cerca de 16 a 17 ms por quadro na escala do jogo (Chromium sem placa de vídeo).

## Versão 9: movimento orgânico e armadura moldada sobre o corpo

**Movimento orgânico e anatômico:**
- **Coluna em dois segmentos:** a lombar faz cerca de 45% da torção e da flexão e o tórax completa, então o tronco curva em vez de girar como bloco. O skinning ganhou os ossos `lombar` (pelve até T12/L1) e `torax` (até C7), ligados às articulações reais do modelo.
- **Cintura escapular:** o ombro sobe quando a mão sobe e avança quando a mão alcança à frente (clavícula e escápula).
- **Quadril:** na guarda parada, o peso passa devagar de uma perna para a outra (desloca, rola e o tronco compensa). Na caminhada, a pelve cai do lado da perna em balanço.
- **Rolamento do pé:** o calcanhar sobe no fim do apoio (impulso pela ponta), a ponta desce no início do balanço e sobe para o calcanhar tocar primeiro. O tornozelo sobe o necessário para nada entrar no chão.
- **Cabeça:** compensa a torção e a inclinação do tronco e mantém o olhar à frente.
- **Ação sobreposta:** cada parâmetro da pose segue o alvo por uma mola amortecida (ζ = 0,72). Tronco e cabeça têm molas mais macias que as mãos e a arma, então chegam um pouco depois e assentam com leve rebote. Os pés não usam mola, para ficarem plantados.

**Armadura moldada (primeira versão).** `tools/mhbody.py` gera cada peça a partir da própria superfície do corpo do atlas. Seleciona a região pelo osso e pela posição ao longo dele, desloca para fora pela espessura da peça e copia os pesos de skinning. Assim cada peça acompanha músculos e articulações e não atravessa a pele.

Peça | Material | Espessura
---|---|---
Couraça | ferro com costelas, esterno e clavículas em relevo, bandoleira e espinha | 1,8 cm
Cinto | couro | 2,2 cm
Saiote | malha | 2,4 cm
Ombreiras | placa | 3,5 cm
Cotoveleiras | placa | 2,2 cm
Braçadeiras | osso com faixas douradas | 1,4 cm
Coxotes | ferro | 1,7 cm
Joelheiras | placa | 2,9 cm
Grevas | osso com tira de couro | 1,7 cm
Botas | couro | 1,1 cm

A couraça usa o mesmo mapa da textura antiga (ângulo em volta do tronco × altura a partir do quadril). As demais peças usam UV cilíndrico no eixo do osso, com a costura tratada. A capa volta junto com a armadura. Ligue com `heroi.setArmor(true)`, que agora usa o corpo do atlas por baixo.

**Desempenho:** cerca de 16 ms por quadro na escala do jogo, com armadura (Chromium sem placa de vídeo).

## Versão 10: físico de guerreiro, pesos profissionais e expressões faciais

Recursos CC0 encontrados na pesquisa (`REFERENCIAS.md`) e baixados do GitHub:

- **Físico de guerreiro.** Os alvos `caucasian-male-young` e `universal-male-young-maxmuscle-averageweight` do MakeHuman são aplicados à malha antes da extração, em `tools/mhcommon.py`, para corpo e cabeça. Resultado: ombros e peito mais largos, braços e coxas musculosos, rosto e pescoço masculinos. Os cortes do pescoço e a detecção do queixo passaram a ser relativos às articulações, porque o corpo mudou de proporção.
- **Pesos de skinning profissionais.** Usam `weights.game_engine.json` do MPFB2 (rig "game engine": pelve, 3 vértebras, clavículas, braços, antebraços, mãos e dedos, coxas, panturrilhas, pés e dedos dos pés). Os ossos são convertidos para os nossos 14 (as clavículas vão para o tórax; mãos e dedos para o antebraço; `spine_02` é dividido entre lombar e tórax). Cada vértice usa até **3 ossos**. A armadura moldada usa os mesmos pesos.
- **Expressões faciais.** Seis expressões compostas a partir das 34 unidades de expressão do MPFB2 (estilo FACS):

  Expressão | Unidades combinadas | Quando aparece
  ---|---|---
  carranca | sobrancelhas baixas e cantos da boca caídos | em repouso
  esforço | sobrancelhas baixas, olhos semicerrados, lábios retraídos (dentes cerrados), nariz franzido, platisma | golpes, Esmagar, Investida, Redemoinho, golpe de escudo (pico no meio do golpe)
  fúria | o esforço, mais boca aberta e lábio superior levantado | Brado e enquanto a Fúria dura
  dor | sobrancelhas internas erguidas, olhos meio fechados, boca para baixo | dano
  morte | olhos fechados, boca entreaberta | morte
  piscar | pálpebras fechadas | sozinho, a cada 2,5 a 6 s

  Os deslocamentos ficam em `guerreiro-cabeca.js` (esparsos, por nível de detalhe). A transição entre expressões é suave (exponencial) e a intensidade é amplificada 1,6× para ser legível de longe.

Para regenerar: `MH_ALVOS=… MH_PESOS=…/weights.game_engine.json python3 tools/mhbody.py base.obj guerreiro-corpo.js` e `MH_ALVOS=… MH_EXPR=…/expressoes python3 tools/mhhead.py base.obj guerreiro-cabeca.js`.

## Versão 11: integração no jogo e otimização de FPS

`tools/integrar_jogo.py` monta `jogo/O_Atlas_Perdido.html` a partir do jogo original:
- **Guerreiro 3D no jogo:** embute os módulos e troca o desenho da classe Guerreiro.
- **Recortes dos atlas:** troca as 13 chamadas que desenhavam a partir dos atlas gigantes (2048×4378, 2048×4608…) por **recortes em cache**, um canvas pequeno por sprite, criado uma vez. Texturas acima de 4096 px caem para o desenho por software em muitos celulares.

**Medição** (Chromium sem placa de vídeo, partida de Guerreiro andando e atacando, perfil de CPU por função):

| | Antes | Depois |
|---|---|---|
| FPS médio | 30 | ≈ 47 |
| quadro p95 | 50 ms | ≈ 33 ms |
| `spr`/`restore` (sprites do jogo) | 19% do tempo | some do topo do perfil |
| redesenho do guerreiro | 12,8 ms | 4,5 ms |
| reaproveitamento da pose | n/a | 0,7 ms |

**Otimizações do guerreiro:**
- **Recorte:** a composição (contorno, brilho, lampejo de dano) copia só o retângulo ocupado pelo personagem, não a tela de trabalho inteira.
- **Contorno:** 4 cópias em vez de 8 no tamanho do jogo.
- **Pose a 30 Hz:** a pose 3D é redesenhada a até 30 vezes por segundo (`maxHz`); a posição na tela continua a cada quadro.
- **Nível de detalhe mínimo:** no tamanho do jogo, a cabeça usa 144 faces, o corpo 242 e a armadura 74.
- **Cor sólida:** no tamanho do jogo, cada face usa a cor média da textura no seu nível de luz, sem textura por face (a textura não é visível com a cabeça a ~15 px).

**Restante no perfil:**
- **Rasterização da tela inteira:** cerca de 55% do tempo, sem função atribuída (terreno, iluminação, pós-processamento).
- **Efeitos de habilidade aditivos** (`artDraw`): cerca de 8%.
- **`drawLighting`:** cerca de 4%.

Próximos candidatos: reduzir a resolução interna da iluminação e do *bloom*, e limitar efeitos aditivos simultâneos.

## Versão 12: só espada, lança e foice no jogo; metal do Canva

**Armas do Guerreiro no jogo** (`tools/integrar_jogo.py`):
- **Lista própria:** `ARMAS_GUERREIRO` com 15 armas: 7 espadas (lâminas e o espadão), **4 lanças novas** (Lança Vertebral, Pique Tibial, Lança do Rádio, Lança da Diáfise Femoral, com o ícone vertebral) e 4 foices.
- **Criação de armas:** `makeItem` passa a sortear o Guerreiro só dessa lista, e isso vale para todo saque, baú e recompensa. Testado com 300 armas geradas: 135 espadas, 87 lanças e 78 foices, nenhuma de outro tipo.
- **Lendária:** "Martelo do Capitato" vira **"Lança do Capitato"** (mesmo poder: Esmagar Trabecular com área 40% maior).
- **Presente inicial:** uma de cada tipo (Espadão Osteocortical, Lança Vertebral, Foice de Ranvier).
- **Equipar:** o jogo bloqueia outras armas para o Guerreiro ("O Guerreiro usa só espada, lança ou foice"). Em salvamentos antigos, a arma proibida equipada vira uma espada e as proibidas saem do inventário.
- **Modelo 3D:** troca sozinho para a lança ou a foice conforme o nome da arma equipada (`syncFromGame`).

**Canva:** a textura de **metal gravado** (arabescos góticos, rebites, sangue) entrou na couraça, nas placas e no ferro (`assets/metal-canva.jpg`, montado por `tools/montar_imagens.py`). Osso, couro, pele e tecido ficaram pendentes por limite de créditos do Canva. Quando forem gerados, basta salvar `assets/<chave>-canva.jpg` e rodar o script.

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

## Versão 13: texturas geradas por código (Claude)
- `tools/gerar_texturas.py` (numpy) pinta as texturas de **osso, couro, pele, tecido e metal** sem depender do Canva: ruído 1/f no domínio de Fourier e células de Worley com volta nas bordas (ladrilham sem emenda).
- **Relevo cozido:** cada textura tem um mapa de altura; dele saem normais, luz difusa, brilho especular e oclusão nas cavidades.
  - osso: lamelas, canais de Havers, fissuras, encardido, sangue seco;
  - couro: grão em células, rugas, arranhões, quinas gastas;
  - pele: mosqueado, poros suaves, sulcos, veias, sardas, cicatrizes em cordão;
  - tecido: trama tafetá com fios irregulares, dobras, furos, barro e sangue;
  - metal: martelado, escovado, filigrana gravada, rebites, corrosão e ferrugem.
- `montar_imagens.py` usa `<chave>-claude.jpg` antes de `<chave>-canva.jpg`. O rosto continua o do Canva. A pele entra com opacidade menor (0,6) para não granular.

## Versão 14: arte das armas no mesmo estilo
- `tools/gerar_armas.py` pinta por código as 16 armas do Guerreiro, com as mesmas texturas e o mesmo relevo cozido do corpo.
  - **7 espadas:** Periosteal, Gládio, Hemorrágica (sulco de sangue), Diáfise (lâmina de osso), Serra, Hemática (ondulada) e Espadão (guarda de vértebras).
  - **4 lanças + a lendária:** Vertebral (anéis de vértebra), Pique Tibial (haste de osso), Rádio (asas e borla carmesim), Diáfise Femoral (cabeça do fêmur no cabo) e **Lança do Capitato** (dourada, osso do carpo e brilho).
  - **4 foices:** Sináptica (crânio no encaixe), Mielínica (bainhas de osso), Ranvier (entalhes) e Condução Saltatória (veias incandescentes).
- No jogo (`integrar_jogo.py`): `spr` (arma no chão) e `iconTo` (inventário e detalhe) usam a arte nova; no inventário, ela fica na diagonal.
- **Drop:** primeiro sorteia o tipo (espada, lança ou foice, 1/3 cada) e depois o modelo. Em 600 drops: 197 espadas, 193 lanças, 210 foices.
- **Saves antigos:** as armas do Guerreiro recebem a arte nova pelo nome, e o "Martelo do Capitato" vira "Lança do Capitato". Nenhum ícone antigo de arma sobra para o Guerreiro.
