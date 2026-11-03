# Mapa vivo: estética do mapa de "O Atlas Perdido"

Camada nova (`mapa-vida.js`) ligada ao jogo por `guerreiro/tools/integrar_jogo.py`. Quase tudo é pintado **uma vez**, no carregamento, sobre o terreno pré-renderizado, então o custo por quadro fica só com a fauna e os esporos. Medido: o FPS se manteve (≈ 47 no Chromium sem placa de vídeo).

## O que saiu (destoava da proposta anatômica, gótica e pintada)
| Antes | Por quê | Agora |
|---|---|---|
| Chão do vale e dos montes em **lajotas** (juntas a cada 3 células, cor e relevo por bloco) | parecia piso de masmorra, não tecido vivo | tecido **contínuo**: manchas, fibras e rede capilar |
| **Cérebro rosa** (pixel art de desenho animado) | estilo e escala destoantes | **cisto** translúcido com vasos e brilho úmido |
| **Rocha** e **"gêiser"** em pixel art de baixa resolução | pixel art no meio da arte pintada | **osteófito** (esporão de osso poroso, com fissuras) e **fístula** (cratera de carne com sangue que borbulha) |
| Tabaqueira anatômica **verde** (no chão e no minimapa) | verde não existe nesse tecido | roxo-avermelhado de tecido contundido |
| **Tendão** em degraus de célula | serrilhado | cordão liso e perolado, com fibras colágenas e reflexo úmido |

## O que entrou
- **Textura de tecido** ladrilhável (256 px), gerada com **simplex-noise** (fBm no toro, sem emenda) e aplicada em *soft-light* sobre todo o chão, preservando o vazio.
- **Osso trabecular:** poros e fissuras multiplicados sobre os platôs de osso.
- **Microflora pintada no chão**, por região, espalhada por **amostragem de Poisson** (Bridson): cerca de 1 elemento a cada 95 unidades de mundo, sem custo por quadro.
  - vale e montes: árvores capilares, coágulos e fios nervosos;
  - dedos: fibrina e capilares;
  - tabaqueira: nervo (ramo do n. radial);
  - carpo: lascas de osso.
- **Fauna:**
  - **ácaros:** cerca de 22 perto do jogador; perambulam guiados pelo ruído, não sobem desníveis e **fogem** quando ele se aproxima;
  - **moscas:** enxames em torno de árvores de vasos, poças e fístulas;
  - **esporos luminosos:** cerca de 46; sobem e oscilam e são desenhados no modo aditivo depois da luz, então brilham no escuro.

## Repositórios do GitHub usados
- [`jwagner/simplex-noise.js`](https://github.com/jwagner/simplex-noise.js) **2.4.0** (MIT). O código está em `vendor/simplex-noise.js`, com a licença em `vendor/simplex-noise.LICENSE`. Gera a textura de tecido, a de osso, o fio nervoso e o andar dos ácaros e dos esporos.
- [`kchapelier/poisson-disk-sampling`](https://github.com/kchapelier/poisson-disk-sampling) (MIT): referência do algoritmo de Bridson, reimplementado em `poisson()` para distribuir a microflora sem aglomerar.

## Como regenerar
`python3 guerreiro/tools/integrar_jogo.py jogo_original.html jogo/O_Atlas_Perdido.html`
