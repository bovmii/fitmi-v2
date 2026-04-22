// Compact local food database. Values are per 100 g (or per 100 mL for
// beverages). Source: public USDA / Ciqual averages, rounded for
// display. The real app can swap external APIs on top of this later;
// for day-to-day logging ~40 entries cover most meals.

export const FOODS = [
  // Fruits
  { name: 'Pomme',             category: 'Fruits',   kcal: 52,  p: 0.3,  c: 14,   f: 0.2 },
  { name: 'Banane',            category: 'Fruits',   kcal: 89,  p: 1.1,  c: 23,   f: 0.3 },
  { name: 'Orange',            category: 'Fruits',   kcal: 47,  p: 0.9,  c: 12,   f: 0.1 },
  { name: 'Fraises',           category: 'Fruits',   kcal: 32,  p: 0.7,  c: 8,    f: 0.3 },
  { name: 'Myrtilles',         category: 'Fruits',   kcal: 57,  p: 0.7,  c: 14,   f: 0.3 },
  { name: 'Avocat',            category: 'Fruits',   kcal: 160, p: 2,    c: 9,    f: 15   },

  // Légumes
  { name: 'Brocoli',           category: 'Légumes',  kcal: 34,  p: 2.8,  c: 7,    f: 0.4 },
  { name: 'Carotte',           category: 'Légumes',  kcal: 41,  p: 0.9,  c: 10,   f: 0.2 },
  { name: 'Tomate',            category: 'Légumes',  kcal: 18,  p: 0.9,  c: 4,    f: 0.2 },
  { name: 'Courgette',         category: 'Légumes',  kcal: 17,  p: 1.2,  c: 3,    f: 0.3 },
  { name: 'Épinards cuits',    category: 'Légumes',  kcal: 23,  p: 3,    c: 4,    f: 0.4 },
  { name: 'Poivron',           category: 'Légumes',  kcal: 31,  p: 1,    c: 6,    f: 0.3 },

  // Protéines
  { name: 'Blanc de poulet',   category: 'Viandes',  kcal: 165, p: 31,   c: 0,    f: 3.6  },
  { name: 'Steak haché 5 %',   category: 'Viandes',  kcal: 137, p: 21,   c: 0,    f: 5.5  },
  { name: 'Steak haché 15 %',  category: 'Viandes',  kcal: 215, p: 20,   c: 0,    f: 15   },
  { name: 'Œuf entier',        category: 'Viandes',  kcal: 155, p: 13,   c: 1.1,  f: 11   },
  { name: 'Jambon blanc',      category: 'Viandes',  kcal: 107, p: 18,   c: 0.5,  f: 3.7  },
  { name: 'Thon au naturel',   category: 'Poissons', kcal: 116, p: 26,   c: 0,    f: 1    },
  { name: 'Saumon',            category: 'Poissons', kcal: 208, p: 20,   c: 0,    f: 13   },
  { name: 'Crevettes',         category: 'Poissons', kcal: 99,  p: 24,   c: 0.2,  f: 0.3  },

  // Laitier
  { name: 'Lait demi-écrémé',  category: 'Laitier',  kcal: 46,  p: 3.2,  c: 4.8,  f: 1.5  },
  { name: 'Fromage blanc 3 %', category: 'Laitier',  kcal: 75,  p: 7,    c: 4,    f: 3    },
  { name: 'Yaourt nature',     category: 'Laitier',  kcal: 61,  p: 3.5,  c: 4.7,  f: 3.3  },
  { name: 'Skyr',              category: 'Laitier',  kcal: 63,  p: 11,   c: 4,    f: 0.2  },
  { name: 'Comté',             category: 'Laitier',  kcal: 413, p: 28,   c: 0.4,  f: 34   },

  // Céréales
  { name: 'Riz blanc cuit',    category: 'Céréales', kcal: 130, p: 2.7,  c: 28,   f: 0.3  },
  { name: 'Riz complet cuit',  category: 'Céréales', kcal: 123, p: 2.6,  c: 25,   f: 1    },
  { name: 'Pâtes cuites',      category: 'Céréales', kcal: 158, p: 5.8,  c: 31,   f: 0.9  },
  { name: 'Pain complet',      category: 'Céréales', kcal: 247, p: 13,   c: 41,   f: 3.4  },
  { name: 'Baguette',          category: 'Céréales', kcal: 270, p: 9,    c: 55,   f: 1    },
  { name: 'Flocons d\'avoine', category: 'Céréales', kcal: 379, p: 13,   c: 68,   f: 6.9  },
  { name: 'Quinoa cuit',       category: 'Céréales', kcal: 120, p: 4.4,  c: 21,   f: 1.9  },

  // Légumineuses / noix
  { name: 'Lentilles cuites',  category: 'Légumineuses', kcal: 116, p: 9,   c: 20,  f: 0.4 },
  { name: 'Pois chiches cuits',category: 'Légumineuses', kcal: 164, p: 9,   c: 27,  f: 2.6 },
  { name: 'Haricots rouges',   category: 'Légumineuses', kcal: 127, p: 9,   c: 23,  f: 0.5 },
  { name: 'Amandes',           category: 'Noix',         kcal: 579, p: 21,  c: 22,  f: 50  },
  { name: 'Noix',              category: 'Noix',         kcal: 654, p: 15,  c: 14,  f: 65  },
  { name: 'Beurre de cacahuète', category: 'Noix',       kcal: 588, p: 25,  c: 20,  f: 50  },

  // Boissons
  { name: 'Eau',               category: 'Boissons', kcal: 0,   p: 0,    c: 0,    f: 0    },
  { name: 'Café noir',         category: 'Boissons', kcal: 2,   p: 0.1,  c: 0,    f: 0    },
  { name: 'Jus d\'orange',     category: 'Boissons', kcal: 45,  p: 0.7,  c: 10,   f: 0.2  },
  { name: 'Bière blonde',      category: 'Boissons', kcal: 43,  p: 0.5,  c: 3.6,  f: 0    },
  { name: 'Vin rouge',         category: 'Boissons', kcal: 85,  p: 0.1,  c: 2.6,  f: 0    },

  // Divers
  { name: 'Huile d\'olive',    category: 'Matières grasses', kcal: 884, p: 0, c: 0,  f: 100 },
  { name: 'Beurre',            category: 'Matières grasses', kcal: 717, p: 0.9, c: 0.1, f: 81 },
  { name: 'Miel',              category: 'Autre',  kcal: 304, p: 0.3, c: 82, f: 0 },
  { name: 'Chocolat noir 70 %',category: 'Autre',  kcal: 598, p: 8,   c: 46, f: 43 },
];

export const FOOD_CATEGORIES = Array.from(new Set(FOODS.map((f) => f.category)));

// Find foods by partial name (case + accent insensitive).
export function searchFoods(query, limit = 20) {
  const q = normalize(query);
  if (!q) return FOODS.slice(0, limit);
  return FOODS
    .filter((f) => normalize(f.name).includes(q))
    .slice(0, limit);
}

export function findByName(name) {
  const n = normalize(name);
  return FOODS.find((f) => normalize(f.name) === n) || null;
}

function normalize(str) {
  return String(str || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
