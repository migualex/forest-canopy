# \# Forest Canopy Cover

# 

# <p align="center">

# &#x20; <img src="icons/forest\_canopy\_icon.png" alt="Forest Canopy Cover" width="80"/>

# </p>

# 

# <p align="center">

# &#x20; <img src="https://img.shields.io/badge/platform-Google%20Earth%20Engine-brightgreen" />

# &#x20; <img src="https://img.shields.io/badge/lifecycle-maturing-green.svg" />

# </p>

# 

# \*\*Acesse a aplicação:\*\* \[programa-r-316514.projects.earthengine.app/view/forest-canopy](https://programa-r-316514.projects.earthengine.app/view/forest-canopy)

# 

# Aplicativo desenvolvido no Google Earth Engine para análise interativa de cobertura florestal a partir de imagens Sentinel-2. As funcionalidades incluem classificação não supervisionada de floresta (K-Means sobre NDVI), estimativa de altura de dossel (Meta Canopy Height), cálculo de estatísticas por área de interesse (AOI) e visualização dinâmica com legenda adaptativa.

# 

# \## Funcionalidades

# 

# \- \*\*Definição de AOI\*\*: por coordenadas (latitude/longitude + raio de buffer) ou desenho livre de polígono no mapa.

# \- \*\*Busca de imagens Sentinel-2\*\*: filtro por intervalo de datas e percentual máximo de nuvens.

# \- \*\*Classificação de cobertura florestal\*\*: agrupamento K-Means sobre o NDVI, com cálculo automático do percentual de área coberta por floresta.

# \- \*\*Altura de dossel\*\*: integração com o dataset Meta Canopy Height, exibindo faixa, média e percentual de área com árvores acima de um limiar configurável.

# \- \*\*Basemap Sentinel-2 dinâmico\*\*: atualizado automaticamente conforme o zoom e a área visível no mapa.

# \- \*\*Legenda dinâmica\*\*: gerada de acordo com as camadas ativas (K-Means, NDVI e altura de dossel).

# 

# \## Como usar

# 

# \### 1. Definir a área de interesse

# \- Informe \*\*Latitude\*\*, \*\*Longitude\*\* e o \*\*raio do buffer (em metros)\*\*, ou

# \- Desenhe um polígono diretamente no mapa usando a ferramenta de desenho.

# 

# \### 2. Configurar a busca do Sentinel-2

# \- Defina a \*\*data inicial\*\* e a \*\*data final\*\* (formato `YYYY-MM-dd`).

# \- Defina o \*\*percentual máximo de nuvens\*\* aceitável nas imagens.

# 

# \### 3. Executar a análise

# Clique em \*\*Run Analysis\*\* para:

# \- Carregar o mosaico Sentinel-2 mais adequado para a AOI;

# \- Calcular o NDVI e classificar a cobertura florestal (K-Means);

# \- Estimar a altura do dossel e o percentual de área com árvores altas;

# \- Exibir os resultados no painel lateral e as camadas correspondentes no mapa.

# 

# \## Metodologia

# 

# \### Classificação de cobertura florestal (K-Means)

# 

# A classificação é não supervisionada, baseada no NDVI (`(B8 - B4) / (B8 + B4)`) calculado sobre o mosaico mediano do Sentinel-2:

# 

# 1\. Amostragem de até 5000 pixels de NDVI na AOI (10 m de resolução, `seed: 42`).

# 2\. Treinamento de um `ee.Clusterer.wekaKMeans(2)` (2 clusters: floresta / não-floresta) sobre as amostras.

# 3\. Aplicação do clusterer a todos os pixels da AOI.

# 4\. Identificação do cluster "floresta" como aquele com \*\*maior NDVI médio\*\*.

# 5\. Cálculo do percentual de floresta via histograma de frequência dos clusters.

# 

# O threshold exibido é a média entre os dois centros de cluster e serve apenas como referência — os grupos são definidos estatisticamente a cada execução, podendo variar entre AOIs e datas distintas.

# 

# \### Altura de dossel (Meta Canopy Height)

# 

# Dataset global de altura de vegetação desenvolvido pela \*\*Meta\*\* em parceria com o \*\*World Resources Institute (WRI)\*\* (`projects/meta-forest-monitoring-okw37/assets/CanopyHeight`), com \*\*resolução espacial de 1 metro\*\*.

# 

# \- Gerado por um modelo de IA (visão computacional) treinado sobre imagens ópticas de altíssima resolução (Maxar Vivid2, 0,5 m), calibrado com dados de referência LiDAR aéreo e GEDI (espacial).

# \- Estima a altura do dossel normalizada em relação ao solo (não é um nDSM genérico, que incluiria também edificações e outras estruturas).

# \- Sensível a nuvens/sombras: em regiões de cobertura de nuvens persistente pode apresentar artefatos (ex.: áreas de vegetação classificadas como solo exposto).

# 

# No app, esse dado alimenta:

# \- Camada de altura de dossel (0–30 m).

# \- Estatísticas de altura mínima, máxima e média na AOI.

# \- Percentual de área com altura acima do limiar configurável (`TALL\_TREE\_THRESHOLD\_M`, padrão 5 m).

# 

# K-Means e Canopy Height são complementares: o primeiro indica \*\*quanto\*\* da área é floresta (classificação categórica); o segundo indica \*\*quão alta\*\* é a vegetação (estimativa contínua em metros).

# 

# \## Autor

# 

# Desenvolvido por \*\*Miguel Alexandre da Cunha\*\*

# 📧 miguel.cunha@inpe.br

# 🔗 \[github.com/migualex](https://github.com/migualex)

# 

# \## Licença

# 

# Este projeto é distribuído sob a licença GNU General Public License v3.0.

# Você é livre para usar, estudar, modificar e distribuir este software, desde

# que mantenha os avisos de copyright e a licença original em qualquer cópia

# ou trabalho derivado, conforme exigido pela GPL-3.0.

