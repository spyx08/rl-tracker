// Couleurs de fond par tier : [variante paire, variante impaire]
export const TIER_FILLS = {
  bronze:   ['rgba(185,105, 35,0.48)', 'rgba(160, 85, 20,0.36)'],
  silver:   ['rgba(175,180,192,0.40)', 'rgba(150,155,168,0.30)'],
  gold:     ['rgba(215,170, 20,0.48)', 'rgba(190,145,  8,0.36)'],
  platinum: ['rgba(  8,178,212,0.42)', 'rgba(  4,152,188,0.32)'],
  diamond:  ['rgba( 38,122,242,0.46)', 'rgba( 18, 96,218,0.34)'],
  champion: ['rgba(145, 42,228,0.42)', 'rgba(118, 20,202,0.32)'],
  gc:       ['rgba(225, 32, 62,0.46)', 'rgba(198, 12, 42,0.34)'],
  ssl:      ['rgba(235,242,255,0.38)', 'rgba(210,220,245,0.28)'],
};

// Couleur du texte des labels par tier (lisible sur le fond coloré)
export const TIER_LABEL_COLORS = {
  bronze:   'rgba(240,165, 90,0.90)',
  silver:   'rgba(215,220,232,0.88)',
  gold:     'rgba(255,210, 55,0.92)',
  platinum: 'rgba( 50,215,245,0.88)',
  diamond:  'rgba( 90,170,255,0.90)',
  champion: 'rgba(195,105,255,0.88)',
  gc:       'rgba(255, 85,115,0.90)',
  ssl:      'rgba(255,255,255,0.95)',
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
