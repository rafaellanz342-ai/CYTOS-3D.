# Recursos abertos para o Guerreiro Ósseo

Pesquisa em GitHub, Reddit, na biblioteca de assets do Godot e em acervos de assets livres. A coluna **Acesso** diz se o recurso pôde ser baixado desta sessão. Só `raw.githubusercontent.com` e `git` do GitHub estão liberados; Reddit, Godot, OpenGameArt, Quaternius, ambientCG e Poly Haven responderam 403 ao proxy.

## Prioridade alta: mesma malha que já usamos, CC0, acessível

| Recurso | Onde | Licença | Acesso | Para que serve no personagem |
|---|---|---|---|---|
| **Alvo de musculatura** `universal-male-young-maxmuscle-averageweight.target` (e os demais *macrodetails*: peso, altura, idade, proporções) | GitHub `makehumancommunity/makehuman`, `makehuman/data/targets/macrodetails` | CC0 (`LICENSE.ASSETS.md`) | ✅ | Aplicar à malha do atlas antes de extrair o corpo, para um **físico de guerreiro** musculoso em vez do corpo médio |
| **Pesos de skinning profissionais** `weights.game_engine.json`, `weights.cmu_mb.json`, `weights.mixamo.json` + esqueletos `rig.*.json` | GitHub `makehumancommunity/mpfb2`, `src/mpfb/data/rigs/standard` | CC0 | ✅ | Trocar os pesos heurísticos atuais, para melhores deformações em **ombros, axilas, quadril e joelhos** |
| **Unidades de expressão facial** (102 alvos: sobrancelhas para baixo/dentro, olho semicerrado, boca aberta, lábio retraído, narinas, platisma do pescoço) | GitHub `mpfb2`, `src/mpfb/data/targets/expression/units` | CC0 | ✅ | **Rosto que reage:** fúria no Brado, dentes cerrados no golpe, careta ao levar dano, olhos fechados na morte |
| **Alvos por região** (braços 50, pernas 58, tronco 34, mãos 22, pés 30, pescoço 20, nariz, queixo, orelhas…) | GitHub `mpfb2`, `src/mpfb/data/targets` | CC0 | ✅ | Ajuste fino da anatomia: ombros mais largos, pescoço grosso, antebraços fortes, mandíbula marcada |
| **Animações BVH** `walk1.bvh`, `zombieWalk1.bvh`, `tpose.bvh` + unidades de pose do rosto e do corpo | GitHub `makehuman`, `makehuman/data/animations`, `poses`, `poseunits` | CC0 | ✅ | Referência de caminhada capturada para calibrar o ciclo procedural; poses faciais prontas |
| **Olhos de alta resolução** `eyes/high-poly/high-poly.obj` | GitHub `makehuman` | CC0 | ✅ | Globos oculares mais redondos que os de ajuda (*helper*) atuais |

## Animação e física (código e técnica)

| Recurso | Onde | Licença | Acesso | Uso |
|---|---|---|---|---|
| **Spring bone do three-vrm** (`@pixiv/three-vrm-springbone`) | GitHub `pixiv/three-vrm` | MIT | ✅ | Algoritmo testado de **molas em cadeia** (rigidez, arrasto, gravidade, colisores esféricos) para refinar cabelo, capa e fitas |
| **SpringBoneSimulator3D** (Godot 4.4+) | Documentação do Godot; exemplo "Godette Plush" na Asset Library | MIT (motor) | ❌ 403 | Referência do mesmo conceito: cadeias de ossos com inércia e colisão. O jogo é HTML/canvas, então vale como técnica, não como código |
| **"An Indie Approach to Procedural Animation"**, David Rosen (Overgrowth), GDC 2014 | GDC Vault; blog da Wolfire | palestra | ❌ (vídeo) | Técnica central do que fizemos: poucas poses-chave + molas + IK. Próximo passo: poses-chave por golpe com interpolação física |
| **Locomoção com IK e passo por limiar** (aranha procedural, post do Reddit divulgado pela 80.lv) e o plugin **OSIK** para Godot 4.5 | Reddit/80.lv/fórum do Godot | variada | ❌ 403 | Ideias para pés em terreno irregular: o pé só dá o passo quando passa de uma distância; trajetória em arco |
| **Quaternius Universal Animation Library 1 e 2** (120+ e 130 animações; combos corpo a corpo, armas, locomoção) | quaternius.com / OpenGameArt | CC0 | ❌ 403 | Captura de golpes reais para **retargeting** no nosso esqueleto. Se você baixar o `.glb`, eu escrevo o conversor |
| **CMU Motion Capture** (2.548 movimentos em BVH via cgspeed) | mocap.cs.cmu.edu | **ambígua** (pesquisa x livre); conversões podem ser NC | ❌ | Só usar depois de confirmar a licença da conversão escolhida |
| **Bandai Namco Research Motion Dataset** (luta, dança, locomoção, BVH) | GitHub `BandaiNamcoResearchInc` | **CC BY-NC (4.0 ou NC-ND)**, proibido uso comercial | via git | **Evitar** se o jogo for comercial; serve só para estudo |

## Modelos, armas e armaduras

| Recurso | Onde | Licença | Acesso | Uso |
|---|---|---|---|---|
| **Pacotes oficiais MakeHuman**: Hats 02 (capacetes), Hair 01, Shirts 01, Pants 01, roupas e materiais de sistema | static.makehumancommunity.org (Asset Packs) | CC0 (repositórios de usuários podem ser CC-BY) | ❌ 403 | Peças já **ajustadas à mesma malha** (sistema `.mhclo`), encaixam no corpo e nos pesos sem retrabalho |
| **Quaternius LowPoly Medieval Weapons** (22 armas: espadas, machados, escudos, arcos) e **Low Poly RPG Pack** | itch.io / OpenGameArt | CC0 | ❌ 403 | Referência de silhueta ou malha para novas armas (machado, maça, martelo) |
| **Low Poly Medieval Helmet** (~930 triângulos, OBJ) e **Viking Helmet** (com escudo redondo) | OpenGameArt | CC0 | ❌ 403 | Base para um elmo opcional na próxima etapa da armadura |
| **Medieval Armor (pixel-art)** com ombreira | OpenGameArt | CC0 | ❌ | Referência de design 2D para as peças |

## Texturas

| Recurso | Licença | Acesso | Uso |
|---|---|---|---|
| **ambientCG** (cerca de 2.000 materiais PBR, ex.: Leather 033A/B/C, metais) | CC0 | ❌ 403 | Couro e metal reais via `GuerreiroOsseo.setImages({ couro, metal })` |
| **Poly Haven** (cerca de 860 texturas: metais, tecidos) | CC0 | ❌ 403 | Idem; também tecido para capa e tanga |

Para os itens bloqueados, basta baixar no seu computador e me enviar o arquivo. Eu converto e integro.

## Recomendação de ordem

> Os itens 1, 2 e 3 já foram aplicados na versão 10 (ver `MELHORIAS.md`).

1. **Corpo de guerreiro:** aplicar o alvo de musculatura ao corpo do atlas.
2. **Pesos profissionais do MPFB2:** trocar os pesos heurísticos (melhora todas as articulações e a armadura moldada).
3. **Expressões faciais** ligadas às ações (Brado, golpe, dano, morte).
4. **Molas no estilo three-vrm** para cabelo e capa.
5. **Golpes capturados** da Quaternius Universal Animation Library, se você baixar o pacote.
6. **Armadura:** peças CC0 do MakeHuman (Hats 02) e texturas da ambientCG.

## Fontes

- [Asset Packs do MakeHuman](https://static.makehumancommunity.org/assets/assetpacks.html) · [Mudança de licença em 2020](https://static.makehumancommunity.org/oldsite/faq/what_changed_regarding_the_license_in_2020.html) · [Uso de assets CC-BY](https://static.makehumancommunity.org/oldsite/faq/what_do_i_need_to_do_when_i_use_a_ccby_asset.html)
- [MPFB 2 (CG Channel)](https://www.cgchannel.com/2025/03/check-out-open-source-blender-character-generation-plugin-mpfb-2) · [MPFB na Blender Extensions](https://extensions.blender.org/add-ons/mpfb/) · [issue sobre o MHX](https://github.com/makehumancommunity/mpfb2/issues/135)
- [@pixiv/three-vrm-springbone (npm)](https://www.npmjs.com/package/@pixiv/three-vrm-springbone)
- [SpringBoneSimulator3D (docs do Godot)](https://docs.godotengine.org/en/stable/classes/class_springbonesimulator3d.html) · [Godot 4.4 jiggle physics](https://gamefromscratch.com/godot-4-4-gets-jiggle-physics/) · [Godette Plush](https://godotengine.org/asset-library/asset/5121)
- [David Rosen, GDC (Game Developer)](https://gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation) · [Discussão no fórum da Unity](https://discussions.unity.com/t/an-indie-approach-to-procedural-animation-gdc-video-talk/538228)
- [Locomoção de aranha com IK no Godot (80.lv)](https://80.lv/articles/ik-driven-procedural-spider-locomotion-in-godot-4-5) · [Fórum do Godot: pernas procedurais](https://forum.godotengine.org/t/need-some-help-with-making-a-good-3d-procedural-mech-leg-system/124271)
- [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) · [no OpenGameArt](https://opengameart.org/content/universal-animation-library) · [UAL 2](https://opengameart.org/content/universal-animation-library-2)
- [Quaternius Medieval Weapons](https://quaternius.itch.io/lowpoly-medieval-weapons) · [Low Poly RPG Pack](https://opengameart.org/content/low-poly-rpg-pack) · [Animated Knight](https://opengameart.org/content/lowpoly-animated-knight)
- [Viking Helmet](https://opengameart.org/content/viking-helmet-0) · [Medieval Armor pixel art](https://opengameart.org/content/medieval-armor-pixel-art)
- [CMU mocap: licenças e formatos (MocapOnline)](https://mocaponline.com/blogs/mocap-news/free-motion-capture-animations) · [Conversão BVH do cgspeed](https://www.sites.google.com/a/cgspeed.com/cgspeed/motion-capture/the-daz-friendly-bvh-release-of-cmus-motion-capture-database)
- [Bandai Namco Research Motion Dataset (README)](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset/blob/master/README.md) · [cobertura da Automaton](https://automaton-media.com/en/news/20220430-12213/)
- [Guia de texturas grátis (ambientCG, Poly Haven)](https://app.cinevva.com/guides/free-textures-hdris-materials)
