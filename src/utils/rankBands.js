// Couleurs de fond par tier : [variante paire, variante impaire]
export const TIER_FILLS = {
  bronze:   ['rgba(180,110, 50,0.22)', 'rgba(180,110, 50,0.13)'],
  silver:   ['rgba(160,165,175,0.18)', 'rgba(160,165,175,0.10)'],
  gold:     ['rgba(200,165, 30,0.22)', 'rgba(200,165, 30,0.13)'],
  platinum: ['rgba( 20,180,210,0.18)', 'rgba( 20,180,210,0.10)'],
  diamond:  ['rgba( 40,130,230,0.22)', 'rgba( 40,130,230,0.13)'],
  champion: ['rgba(140, 50,220,0.18)', 'rgba(140, 50,220,0.10)'],
  gc:       ['rgba(210, 40, 70,0.22)', 'rgba(210, 40, 70,0.13)'],
  ssl:      ['rgba(255,150, 20,0.28)', 'rgba(255,150, 20,0.18)'],
};

// min/max = bornes MMR du rang complet (toutes divisions confondues)
const raw = [
  { name: 'Bronze I',           short: 'B1',  min: -100, max:  161, tier: 'bronze'   },
  { name: 'Bronze II',          short: 'B2',  min:  168, max:  220, tier: 'bronze'   },
  { name: 'Bronze III',         short: 'B3',  min:  229, max:  284, tier: 'bronze'   },
  { name: 'Silver I',           short: 'S1',  min:  291, max:  346, tier: 'silver'   },
  { name: 'Silver II',          short: 'S2',  min:  351, max:  405, tier: 'silver'   },
  { name: 'Silver III',         short: 'S3',  min:  412, max:  465, tier: 'silver'   },
  { name: 'Gold I',             short: 'G1',  min:  471, max:  526, tier: 'gold'     },
  { name: 'Gold II',            short: 'G2',  min:  532, max:  585, tier: 'gold'     },
  { name: 'Gold III',           short: 'G3',  min:  593, max:  645, tier: 'gold'     },
  { name: 'Platinum I',         short: 'P1',  min:  652, max:  705, tier: 'platinum' },
  { name: 'Platinum II',        short: 'P2',  min:  712, max:  765, tier: 'platinum' },
  { name: 'Platinum III',       short: 'P3',  min:  767, max:  825, tier: 'platinum' },
  { name: 'Diamond I',          short: 'D1',  min:  835, max:  901, tier: 'diamond'  },
  { name: 'Diamond II',         short: 'D2',  min:  914, max:  984, tier: 'diamond'  },
  { name: 'Diamond III',        short: 'D3',  min:  994, max: 1060, tier: 'diamond'  },
  { name: 'Champion I',         short: 'C1',  min: 1075, max: 1179, tier: 'champion' },
  { name: 'Champion II',        short: 'C2',  min: 1195, max: 1299, tier: 'champion' },
  { name: 'Champion III',       short: 'C3',  min: 1314, max: 1419, tier: 'champion' },
  { name: 'Grand Champion I',   short: 'GC1', min: 1435, max: 1559, tier: 'gc'       },
  { name: 'Grand Champion II',  short: 'GC2', min: 1575, max: 1698, tier: 'gc'       },
  { name: 'Grand Champion III', short: 'GC3', min: 1715, max: 1858, tier: 'gc'       },
  { name: 'Supersonic Legend',  short: 'SSL', min: 1860, max: 2200, tier: 'ssl'      },
];

// Indice au sein du tier pour l'alternance de couleurs
const tierIdx = {};
export const RANK_BANDS = raw.map(b => {
  tierIdx[b.tier] = (tierIdx[b.tier] ?? -1) + 1;
  return { ...b, tierIdx: tierIdx[b.tier] };
});
