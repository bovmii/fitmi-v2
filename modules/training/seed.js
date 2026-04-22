// Pre-seeded exercise catalogue. Gets inserted into IndexedDB the very
// first time the Training tab is mounted on an empty DB so users get
// something to pick from. Each seeded row has `custom: false` so it's
// distinguishable from user-added entries.

export const SEED_EXERCISES = [
  // Pectoraux
  { name: 'Développé couché haltères', muscleGroup: 'Pectoraux' },
  { name: 'Développé couché barre',    muscleGroup: 'Pectoraux' },
  { name: 'Développé incliné',         muscleGroup: 'Pectoraux' },
  { name: 'Écarté haltères',           muscleGroup: 'Pectoraux' },
  { name: 'Pompes',                    muscleGroup: 'Pectoraux' },

  // Dos
  { name: 'Tractions',                 muscleGroup: 'Dos' },
  { name: 'Rowing haltère',            muscleGroup: 'Dos' },
  { name: 'Tirage horizontal',         muscleGroup: 'Dos' },
  { name: 'Tirage vertical',           muscleGroup: 'Dos' },
  { name: 'Soulevé de terre',          muscleGroup: 'Dos' },

  // Épaules
  { name: 'Développé militaire',       muscleGroup: 'Épaules' },
  { name: 'Élévations latérales',      muscleGroup: 'Épaules' },
  { name: 'Oiseau',                    muscleGroup: 'Épaules' },

  // Biceps
  { name: 'Curl haltères',             muscleGroup: 'Biceps' },
  { name: 'Curl marteau',              muscleGroup: 'Biceps' },
  { name: 'Curl barre EZ',             muscleGroup: 'Biceps' },

  // Triceps
  { name: 'Dips',                      muscleGroup: 'Triceps' },
  { name: 'Extensions triceps',        muscleGroup: 'Triceps' },
  { name: 'Pushdown câble',            muscleGroup: 'Triceps' },

  // Jambes
  { name: 'Squat',                     muscleGroup: 'Jambes' },
  { name: 'Fentes',                    muscleGroup: 'Jambes' },
  { name: 'Leg press',                 muscleGroup: 'Jambes' },
  { name: 'Soulevé de terre roumain',  muscleGroup: 'Jambes' },
  { name: 'Extensions jambes',         muscleGroup: 'Jambes' },
  { name: 'Mollets debout',            muscleGroup: 'Jambes' },

  // Abdominaux
  { name: 'Crunch',                    muscleGroup: 'Abdominaux' },
  { name: 'Planche',                   muscleGroup: 'Abdominaux' },
  { name: 'Relevé de jambes',          muscleGroup: 'Abdominaux' },

  // Cardio
  { name: 'Course à pied',             muscleGroup: 'Cardio' },
  { name: 'Vélo',                      muscleGroup: 'Cardio' },
  { name: 'Rameur',                    muscleGroup: 'Cardio' },
  { name: 'Corde à sauter',            muscleGroup: 'Cardio' },
];
