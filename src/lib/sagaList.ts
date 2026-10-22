// Les sagas du cinéma. Chaque film est cherché dans Cinemeta par son titre (plusieurs titres
// possibles séparés par « | ») et son année de sortie. chrono : l'ordre de l'histoire, en
// positions dans la liste des films (rangée par date de sortie).

export type SagaCat = 'heroes' | 'scifi' | 'fantasy' | 'action' | 'animation' | 'horror' | 'comedy' | 'cult' | 'france';

export const SAGA_CATS: { id: SagaCat; label: string }[] = [
  { id: 'heroes', label: 'Super-héros' },
  { id: 'scifi', label: 'Science-fiction' },
  { id: 'fantasy', label: 'Aventure & fantasy' },
  { id: 'action', label: 'Action & espionnage' },
  { id: 'animation', label: 'Animation' },
  { id: 'horror', label: 'Horreur' },
  { id: 'comedy', label: 'Comédie' },
  { id: 'cult', label: 'Culte & polar' },
  { id: 'france', label: 'Made in France' },
];

export type Film = [string, number, string?];

export interface SagaDef {
  id: string;
  name: string;
  tagline: string;
  cat: SagaCat;
  color: string;
  /** Film dont l'image représente la saga */
  hero?: number;
  /** [titre(s) à chercher, année, identifiant IMDb s'il est connu] */
  films: Film[];
  chrono?: number[];
}

export const SAGAS: SagaDef[] = [
  // ---------- Super-héros ----------
  {
    id: 'mcu', name: 'Marvel Cinematic Universe', tagline: 'Iron Man, Thor, Captain America et toute la bande des Avengers.', cat: 'heroes', color: '#e62429', hero: 21,
    films: [
      ['Iron Man', 2008, 'tt0371746'], ['The Incredible Hulk', 2008, 'tt0800080'], ['Iron Man 2', 2010, 'tt1228705'], ['Thor', 2011, 'tt0800369'], ['Captain America: The First Avenger', 2011, 'tt0458339'],
      ['The Avengers', 2012, 'tt0848228'], ['Iron Man 3', 2013, 'tt1300854'], ['Thor: The Dark World', 2013, 'tt1981115'], ['Captain America: The Winter Soldier', 2014, 'tt1843866'],
      ['Guardians of the Galaxy', 2014, 'tt2015381'], ['Avengers: Age of Ultron', 2015, 'tt2395427'], ['Ant-Man', 2015, 'tt0478970'], ['Captain America: Civil War', 2016, 'tt3498820'],
      ['Doctor Strange', 2016, 'tt1211837'], ['Guardians of the Galaxy Vol. 2', 2017, 'tt3896198'], ['Spider-Man: Homecoming', 2017, 'tt2250912'], ['Thor: Ragnarok', 2017, 'tt3501632'],
      ['Black Panther', 2018, 'tt1825683'], ['Avengers: Infinity War', 2018, 'tt4154756'], ['Ant-Man and the Wasp', 2018, 'tt5095030'], ['Captain Marvel', 2019, 'tt4154664'],
      ['Avengers: Endgame', 2019, 'tt4154796'], ['Spider-Man: Far from Home', 2019, 'tt6320628'], ['Black Widow', 2021, 'tt3480822'], ['Shang-Chi and the Legend of the Ten Rings', 2021, 'tt9376612'],
      ['Eternals', 2021, 'tt9032400'], ['Spider-Man: No Way Home', 2021, 'tt10872600'], ['Doctor Strange in the Multiverse of Madness', 2022, 'tt9419884'], ['Thor: Love and Thunder', 2022, 'tt10648342'],
      ['Black Panther: Wakanda Forever', 2022, 'tt9114286'], ['Ant-Man and the Wasp: Quantumania', 2023, 'tt10954600'], ['Guardians of the Galaxy Vol. 3', 2023, 'tt6791350'],
      ['The Marvels', 2023, 'tt10676048'], ['Deadpool & Wolverine', 2024, 'tt6263850'], ['Captain America: Brave New World', 2025, 'tt14513804'], ['Thunderbolts*|Thunderbolts', 2025, 'tt20969586'],
      ['The Fantastic Four: First Steps', 2025, 'tt10676052'], ['Spider-Man: Brand New Day', 2026],
    ],
    chrono: [4, 20, 0, 2, 1, 3, 5, 6, 7, 8, 9, 14, 10, 11, 12, 23, 17, 15, 13, 16, 19, 18, 21, 24, 22, 25, 26, 27, 29, 28, 32, 30, 31, 33, 34, 35, 37, 36],
  },
  {
    id: 'xmen', name: 'X-Men', tagline: 'Les mutants du professeur Xavier, Wolverine et Deadpool.', cat: 'heroes', color: '#f5c518', hero: 6,
    films: [
      ['X-Men', 2000, 'tt0120903'], ['X2|X-Men 2', 2003, 'tt0290334'], ['X-Men: The Last Stand', 2006, 'tt0376994'], ['X-Men Origins: Wolverine', 2009, 'tt0458525'], ['X-Men: First Class', 2011, 'tt1270798'],
      ['The Wolverine', 2013, 'tt1430132'], ['X-Men: Days of Future Past', 2014, 'tt1877832'], ['Deadpool', 2016, 'tt1431045'], ['X-Men: Apocalypse', 2016, 'tt3385516'], ['Logan', 2017, 'tt3315342'],
      ['Deadpool 2', 2018, 'tt5463162'], ['Dark Phoenix', 2019, 'tt6565702'], ['The New Mutants', 2020, 'tt4682266'],
    ],
    chrono: [4, 6, 8, 11, 3, 0, 1, 2, 5, 7, 10, 12, 9],
  },
  {
    id: 'darkknight', name: 'The Dark Knight', tagline: 'La trilogie Batman de Christopher Nolan.', cat: 'heroes', color: '#8a9bb0', hero: 1,
    films: [['Batman Begins', 2005, 'tt0372784'], ['The Dark Knight', 2008, 'tt0468569'], ['The Dark Knight Rises', 2012, 'tt1345836']],
  },
  {
    id: 'dceu', name: 'DC Extended Universe', tagline: 'Superman, Batman, Wonder Woman et la Justice League.', cat: 'heroes', color: '#0476f2', hero: 1,
    films: [
      ['Man of Steel', 2013, 'tt0770828'], ['Batman v Superman: Dawn of Justice', 2016, 'tt2975590'], ['Suicide Squad', 2016, 'tt1386697'], ['Wonder Woman', 2017, 'tt0451279'], ['Justice League', 2017, 'tt0974015'],
      ['Aquaman', 2018, 'tt1477834'], ['Shazam!', 2019, 'tt0448115'], ['Birds of Prey', 2020, 'tt7713068'], ['Wonder Woman 1984', 2020, 'tt7126948'], ["Zack Snyder's Justice League", 2021, 'tt12361974'],
      ['The Suicide Squad', 2021, 'tt6334354'], ['Black Adam', 2022, 'tt6443346'], ['Shazam! Fury of the Gods', 2023, 'tt10151854'], ['The Flash', 2023, 'tt0439572'], ['Blue Beetle', 2023, 'tt9362930'],
      ['Aquaman and the Lost Kingdom', 2023, 'tt9663764'],
    ],
    chrono: [3, 8, 0, 1, 2, 4, 9, 5, 6, 7, 10, 11, 12, 13, 14, 15],
  },
  {
    id: 'spiderman', name: 'Spider-Man', tagline: 'L’homme-araignée de Sam Raimi, puis The Amazing Spider-Man.', cat: 'heroes', color: '#df1f2d', hero: 1,
    films: [['Spider-Man', 2002, 'tt0145487'], ['Spider-Man 2', 2004, 'tt0316654'], ['Spider-Man 3', 2007, 'tt0413300'], ['The Amazing Spider-Man', 2012, 'tt0948470'], ['The Amazing Spider-Man 2', 2014, 'tt1872181']],
  },
  {
    id: 'batman89', name: 'Batman (1989-1997)', tagline: 'Le Batman gothique de Tim Burton, puis celui de Joel Schumacher.', cat: 'heroes', color: '#c9a227',
    films: [['Batman', 1989, 'tt0096895'], ['Batman Returns', 1992, 'tt0103776'], ['Batman Forever', 1995, 'tt0112462'], ['Batman & Robin', 1997, 'tt0118688']],
  },
  {
    id: 'superman', name: 'Superman', tagline: 'Christopher Reeve, le premier vrai super-héros du grand écran.', cat: 'heroes', color: '#1f5fd1',
    films: [['Superman', 1978, 'tt0078346'], ['Superman II', 1980, 'tt0081573'], ['Superman III', 1983, 'tt0086393'], ['Superman IV: The Quest for Peace', 1987, 'tt0094074'], ['Superman Returns', 2006, 'tt0348150']],
  },
  {
    id: 'venom', name: 'Venom', tagline: 'Eddie Brock et son symbiote affamé.', cat: 'heroes', color: '#9aa5b1',
    films: [['Venom', 2018, 'tt1270797'], ['Venom: Let There Be Carnage', 2021, 'tt7097896'], ['Venom: The Last Dance', 2024, 'tt16366836']],
  },
  {
    id: 'blade', name: 'Blade', tagline: 'Wesley Snipes, mi-homme mi-vampire, chasseur de vampires.', cat: 'heroes', color: '#b3001b',
    films: [['Blade', 1998, 'tt0120611'], ['Blade II', 2002, 'tt0187738'], ['Blade: Trinity', 2004, 'tt0359013']],
  },

  // ---------- Science-fiction ----------
  {
    id: 'starwars', name: 'Star Wars', tagline: 'Il y a bien longtemps, dans une galaxie lointaine, très lointaine…', cat: 'scifi', color: '#ffe81f', hero: 1,
    films: [
      ['Star Wars: Episode IV - A New Hope|Star Wars', 1977, 'tt0076759'], ['Star Wars: Episode V - The Empire Strikes Back|The Empire Strikes Back', 1980, 'tt0080684'],
      ['Star Wars: Episode VI - Return of the Jedi|Return of the Jedi', 1983, 'tt0086190'], ['Star Wars: Episode I - The Phantom Menace|The Phantom Menace', 1999, 'tt0120915'],
      ['Star Wars: Episode II - Attack of the Clones|Attack of the Clones', 2002, 'tt0121765'], ['Star Wars: Episode III - Revenge of the Sith|Revenge of the Sith', 2005, 'tt0121766'],
      ['Star Wars: Episode VII - The Force Awakens|The Force Awakens', 2015, 'tt2488496'], ['Rogue One: A Star Wars Story|Rogue One', 2016, 'tt3748528'],
      ['Star Wars: Episode VIII - The Last Jedi|The Last Jedi', 2017, 'tt2527336'], ['Solo: A Star Wars Story|Solo', 2018, 'tt3778644'],
      ['Star Wars: Episode IX - The Rise of Skywalker|The Rise of Skywalker', 2019, 'tt2527338'], ['The Mandalorian and Grogu|The Mandalorian & Grogu', 2026],
    ],
    chrono: [3, 4, 5, 9, 7, 0, 1, 2, 11, 6, 8, 10],
  },
  {
    id: 'matrix', name: 'Matrix', tagline: 'Pilule bleue ou pilule rouge ?', cat: 'scifi', color: '#00ff6a',
    films: [['The Matrix', 1999, 'tt0133093'], ['The Matrix Reloaded', 2003, 'tt0234215'], ['The Matrix Revolutions', 2003, 'tt0242653'], ['The Matrix Resurrections', 2021, 'tt10838180']],
  },
  {
    id: 'alien', name: 'Alien', tagline: 'Dans l’espace, personne ne vous entend crier.', cat: 'scifi', color: '#7fd1a8',
    films: [['Alien', 1979, 'tt0078748'], ['Aliens', 1986, 'tt0090605'], ['Alien 3|Alien³', 1992, 'tt0103644'], ['Alien: Resurrection', 1997, 'tt0118583'], ['Prometheus', 2012, 'tt1446714'], ['Alien: Covenant', 2017, 'tt2316204'], ['Alien: Romulus', 2024, 'tt18412256']],
    chrono: [4, 5, 0, 6, 1, 2, 3],
  },
  {
    id: 'bttf', name: 'Retour vers le futur', tagline: 'Marty, Doc et une DeLorean qui file à 88 miles à l’heure.', cat: 'scifi', color: '#ff8a00',
    films: [['Back to the Future', 1985, 'tt0088763'], ['Back to the Future Part II', 1989, 'tt0096874'], ['Back to the Future Part III', 1990, 'tt0099088']],
  },
  {
    id: 'terminator', name: 'Terminator', tagline: 'I’ll be back.', cat: 'scifi', color: '#4fa3ff', hero: 1,
    films: [
      ['The Terminator', 1984, 'tt0088247'], ['Terminator 2: Judgment Day', 1991, 'tt0103064'], ['Terminator 3: Rise of the Machines', 2003, 'tt0181852'], ['Terminator Salvation', 2009, 'tt0438488'],
      ['Terminator Genisys', 2015, 'tt1340138'], ['Terminator: Dark Fate', 2019, 'tt6450804'],
    ],
  },
  {
    id: 'jurassic', name: 'Jurassic Park', tagline: 'La vie trouve toujours un chemin.', cat: 'scifi', color: '#e8b923',
    films: [
      ['Jurassic Park', 1993, 'tt0107290'], ['The Lost World: Jurassic Park', 1997, 'tt0119567'], ['Jurassic Park III', 2001, 'tt0163025'], ['Jurassic World', 2015, 'tt0369610'],
      ['Jurassic World: Fallen Kingdom', 2018, 'tt4881806'], ['Jurassic World Dominion', 2022, 'tt8041270'], ['Jurassic World Rebirth', 2025, 'tt31036941'],
    ],
  },
  {
    id: 'dune', name: 'Dune', tagline: 'Arrakis, l’Épice et les vers des sables de Denis Villeneuve.', cat: 'scifi', color: '#e0a35a', hero: 1,
    films: [['Dune|Dune: Part One', 2021, 'tt1160419'], ['Dune: Part Two', 2024, 'tt15239678']],
  },
  {
    id: 'avatar', name: 'Avatar', tagline: 'Pandora et le peuple Na’vi de James Cameron.', cat: 'scifi', color: '#29c5f6',
    films: [['Avatar', 2009, 'tt0499549'], ['Avatar: The Way of Water', 2022, 'tt1630029'], ['Avatar: Fire and Ash', 2025, 'tt1757678']],
  },
  {
    id: 'startrek', name: 'Star Trek', tagline: 'Explorer de nouveaux mondes, là où nul homme n’est jamais allé.', cat: 'scifi', color: '#d4a017', hero: 10,
    films: [
      ['Star Trek: The Motion Picture', 1979, 'tt0079945'], ['Star Trek II: The Wrath of Khan', 1982, 'tt0084726'], ['Star Trek III: The Search for Spock', 1984, 'tt0088170'],
      ['Star Trek IV: The Voyage Home', 1986, 'tt0092007'], ['Star Trek V: The Final Frontier', 1989, 'tt0098382'], ['Star Trek VI: The Undiscovered Country', 1991, 'tt0102975'],
      ['Star Trek: Generations', 1994, 'tt0111280'], ['Star Trek: First Contact', 1996, 'tt0117731'], ['Star Trek: Insurrection', 1998, 'tt0120844'], ['Star Trek: Nemesis', 2002, 'tt0253754'],
      ['Star Trek', 2009, 'tt0796366'], ['Star Trek Into Darkness', 2013, 'tt1408101'], ['Star Trek Beyond', 2016, 'tt2660888'],
    ],
  },
  {
    id: 'madmax', name: 'Mad Max', tagline: 'Le désert, le carburant et la folie de George Miller.', cat: 'scifi', color: '#ff6a00', hero: 3,
    films: [['Mad Max', 1979, 'tt0079501'], ['Mad Max 2|The Road Warrior', 1981, 'tt0082694'], ['Mad Max Beyond Thunderdome', 1985, 'tt0089530'], ['Mad Max: Fury Road', 2015, 'tt1392190'], ['Furiosa: A Mad Max Saga|Furiosa', 2024, 'tt12037194']],
    chrono: [0, 1, 2, 4, 3],
  },
  {
    id: 'apes', name: 'La Planète des singes', tagline: 'Le jour où les singes ont pris le pouvoir.', cat: 'scifi', color: '#c08a4b', hero: 7,
    films: [
      ['Planet of the Apes', 1968, 'tt0063442'], ['Beneath the Planet of the Apes', 1970, 'tt0065462'], ['Escape from the Planet of the Apes', 1971, 'tt0067065'],
      ['Conquest of the Planet of the Apes', 1972, 'tt0068408'], ['Battle for the Planet of the Apes', 1973, 'tt0069768'], ['Rise of the Planet of the Apes', 2011, 'tt1318514'],
      ['Dawn of the Planet of the Apes', 2014, 'tt2103281'], ['War for the Planet of the Apes', 2017, 'tt3450958'], ['Kingdom of the Planet of the Apes', 2024, 'tt11389872'],
    ],
  },
  {
    id: 'predator', name: 'Predator', tagline: 'Le chasseur venu d’ailleurs.', cat: 'scifi', color: '#5fd35f',
    films: [['Predator', 1987, 'tt0093773'], ['Predator 2', 1990, 'tt0100403'], ['Predators', 2010, 'tt1424381'], ['The Predator', 2018, 'tt3829266'], ['Prey', 2022, 'tt11866324'], ['Predator: Badlands', 2025]],
    chrono: [4, 0, 1, 2, 3, 5],
  },
  {
    id: 'transformers', name: 'Transformers', tagline: 'Autobots contre Decepticons.', cat: 'scifi', color: '#e2231a',
    films: [
      ['Transformers', 2007, 'tt0418279'], ['Transformers: Revenge of the Fallen', 2009, 'tt1055369'], ['Transformers: Dark of the Moon', 2011, 'tt1399103'], ['Transformers: Age of Extinction', 2014, 'tt2109248'],
      ['Transformers: The Last Knight', 2017, 'tt3371366'], ['Bumblebee', 2018, 'tt4701182'], ['Transformers: Rise of the Beasts', 2023, 'tt5090568'],
    ],
    chrono: [5, 6, 0, 1, 2, 3, 4],
  },
  {
    id: 'monsterverse', name: 'MonsterVerse', tagline: 'Godzilla, King Kong et les titans.', cat: 'scifi', color: '#3dd6c6', hero: 3,
    films: [['Godzilla', 2014, 'tt0831387'], ['Kong: Skull Island', 2017, 'tt3731562'], ['Godzilla: King of the Monsters', 2019, 'tt3741700'], ['Godzilla vs. Kong', 2021, 'tt5034838'], ['Godzilla x Kong: The New Empire', 2024, 'tt14539740']],
    chrono: [1, 0, 2, 3, 4],
  },
  {
    id: 'mib', name: 'Men in Black', tagline: 'Ils protègent la Terre de la racaille de l’univers.', cat: 'scifi', color: '#c0c0c0',
    films: [['Men in Black', 1997, 'tt0119654'], ['Men in Black II', 2002, 'tt0120912'], ['Men in Black 3', 2012, 'tt1409024'], ['Men in Black: International', 2019, 'tt2283336']],
  },
  {
    id: 'hungergames', name: 'Hunger Games', tagline: 'Puisse le sort vous être favorable.', cat: 'scifi', color: '#f0a020',
    films: [
      ['The Hunger Games', 2012, 'tt1392170'], ['The Hunger Games: Catching Fire', 2013, 'tt1951264'], ['The Hunger Games: Mockingjay - Part 1', 2014, 'tt1951265'],
      ['The Hunger Games: Mockingjay - Part 2', 2015, 'tt1951266'], ['The Hunger Games: The Ballad of Songbirds & Snakes', 2023, 'tt10545296'],
    ],
    chrono: [4, 0, 1, 2, 3],
  },
  {
    id: 'bladerunner', name: 'Blade Runner', tagline: 'Les réplicants rêvent-ils de moutons électriques ?', cat: 'scifi', color: '#ff4fa3', hero: 1,
    films: [['Blade Runner', 1982, 'tt0083658'], ['Blade Runner 2049', 2017, 'tt1856101']],
  },
  {
    id: 'tron', name: 'Tron', tagline: 'De l’autre côté de l’écran, dans la Grille.', cat: 'scifi', color: '#00e5ff', hero: 1,
    films: [['Tron', 1982, 'tt0084827'], ['Tron: Legacy', 2010, 'tt1104001'], ['Tron: Ares', 2025, 'tt6604188']],
  },
  {
    id: 'mazerunner', name: 'Le Labyrinthe', tagline: 'Échapper au labyrinthe, puis au monde d’après.', cat: 'scifi', color: '#8bc34a',
    films: [['The Maze Runner', 2014, 'tt1790864'], ['Maze Runner: The Scorch Trials', 2015, 'tt4046784'], ['Maze Runner: The Death Cure', 2018, 'tt4500922']],
  },
  {
    id: 'divergent', name: 'Divergente', tagline: 'Une société divisée en cinq factions.', cat: 'scifi', color: '#e57373',
    films: [['Divergent', 2014, 'tt1840309'], ['Insurgent|The Divergent Series: Insurgent', 2015, 'tt2908446'], ['Allegiant|The Divergent Series: Allegiant', 2016, 'tt3410834']],
  },

  // ---------- Aventure & fantasy ----------
  {
    id: 'wizarding', name: 'Harry Potter & Animaux fantastiques', tagline: 'Le monde des sorciers, de Poudlard à Grindelwald.', cat: 'fantasy', color: '#d4a84a', hero: 7,
    films: [
      ["Harry Potter and the Sorcerer's Stone|Harry Potter and the Philosopher's Stone", 2001, 'tt0241527'], ['Harry Potter and the Chamber of Secrets', 2002, 'tt0295297'],
      ['Harry Potter and the Prisoner of Azkaban', 2004, 'tt0304141'], ['Harry Potter and the Goblet of Fire', 2005, 'tt0330373'], ['Harry Potter and the Order of the Phoenix', 2007, 'tt0373889'],
      ['Harry Potter and the Half-Blood Prince', 2009, 'tt0417741'], ['Harry Potter and the Deathly Hallows: Part 1', 2010, 'tt0926084'], ['Harry Potter and the Deathly Hallows: Part 2', 2011, 'tt1201607'],
      ['Fantastic Beasts and Where to Find Them', 2016, 'tt3183660'], ['Fantastic Beasts: The Crimes of Grindelwald', 2018, 'tt4123430'], ['Fantastic Beasts: The Secrets of Dumbledore', 2022, 'tt4123432'],
    ],
    chrono: [8, 9, 10, 0, 1, 2, 3, 4, 5, 6, 7],
  },
  {
    id: 'middleearth', name: 'La Terre du Milieu', tagline: 'Le Seigneur des anneaux et Le Hobbit.', cat: 'fantasy', color: '#e3b04b', hero: 2,
    films: [
      ['The Lord of the Rings: The Fellowship of the Ring', 2001, 'tt0120737'], ['The Lord of the Rings: The Two Towers', 2002, 'tt0167261'], ['The Lord of the Rings: The Return of the King', 2003, 'tt0167260'],
      ['The Hobbit: An Unexpected Journey', 2012, 'tt0903624'], ['The Hobbit: The Desolation of Smaug', 2013, 'tt1170358'], ['The Hobbit: The Battle of the Five Armies', 2014, 'tt2310332'],
      ['The Lord of the Rings: The War of the Rohirrim', 2024, 'tt14824600'],
    ],
    chrono: [6, 3, 4, 5, 0, 1, 2],
  },
  {
    id: 'indy', name: 'Indiana Jones', tagline: 'Le fouet, le chapeau et les trésors perdus.', cat: 'fantasy', color: '#c6862d',
    films: [
      ['Raiders of the Lost Ark|Indiana Jones and the Raiders of the Lost Ark', 1981, 'tt0082971'], ['Indiana Jones and the Temple of Doom', 1984, 'tt0087469'],
      ['Indiana Jones and the Last Crusade', 1989, 'tt0097576'], ['Indiana Jones and the Kingdom of the Crystal Skull', 2008, 'tt0367882'], ['Indiana Jones and the Dial of Destiny', 2023, 'tt1462764'],
    ],
    chrono: [1, 0, 2, 3, 4],
  },
  {
    id: 'pirates', name: 'Pirates des Caraïbes', tagline: 'Jack Sparrow, le Black Pearl et la malédiction.', cat: 'fantasy', color: '#c9a86a',
    films: [
      ['Pirates of the Caribbean: The Curse of the Black Pearl', 2003, 'tt0325980'], ["Pirates of the Caribbean: Dead Man's Chest", 2006, 'tt0383574'],
      ["Pirates of the Caribbean: At World's End", 2007, 'tt0449088'], ['Pirates of the Caribbean: On Stranger Tides', 2011, 'tt1298650'], ['Pirates of the Caribbean: Dead Men Tell No Tales', 2017, 'tt1790809'],
    ],
  },
  {
    id: 'mummy', name: 'La Momie', tagline: 'Imhotep se réveille, Rick O’Connell aussi.', cat: 'fantasy', color: '#d9b26f',
    films: [['The Mummy', 1999, 'tt0120616'], ['The Mummy Returns', 2001, 'tt0209163'], ['The Scorpion King', 2002, 'tt0277296'], ['The Mummy: Tomb of the Dragon Emperor', 2008, 'tt0859163']],
    chrono: [2, 0, 1, 3],
  },
  {
    id: 'narnia', name: 'Le Monde de Narnia', tagline: 'De l’autre côté de l’armoire.', cat: 'fantasy', color: '#9fd3e6',
    films: [['The Chronicles of Narnia: The Lion, the Witch and the Wardrobe', 2005, 'tt0363771'], ['The Chronicles of Narnia: Prince Caspian', 2008, 'tt0499448'], ['The Chronicles of Narnia: The Voyage of the Dawn Treader', 2010, 'tt0980970']],
  },
  {
    id: 'twilight', name: 'Twilight', tagline: 'Bella, Edward et Jacob.', cat: 'fantasy', color: '#b0413e',
    films: [
      ['Twilight', 2008, 'tt1099212'], ['The Twilight Saga: New Moon', 2009, 'tt1259571'], ['The Twilight Saga: Eclipse', 2010, 'tt1325004'],
      ['The Twilight Saga: Breaking Dawn - Part 1', 2011, 'tt1324999'], ['The Twilight Saga: Breaking Dawn - Part 2', 2012, 'tt1673434'],
    ],
  },
  {
    id: 'jumanji', name: 'Jumanji', tagline: 'Le jeu qui vous aspire.', cat: 'fantasy', color: '#4caf50', hero: 1,
    films: [['Jumanji', 1995, 'tt0113497'], ['Jumanji: Welcome to the Jungle', 2017, 'tt2283362'], ['Jumanji: The Next Level', 2019, 'tt7975244']],
  },
  {
    id: 'nationaltreasure', name: 'Benjamin Gates', tagline: 'Chasse au trésor dans l’histoire des États-Unis.', cat: 'fantasy', color: '#d4af37',
    films: [['National Treasure', 2004, 'tt0368891'], ['National Treasure: Book of Secrets', 2007, 'tt0465234']],
  },

  // ---------- Action & espionnage ----------
  {
    id: 'bond', name: 'James Bond 007', tagline: 'Bond. James Bond. Soixante ans d’espionnage, de Sean Connery à Daniel Craig.', cat: 'action', color: '#d4af37', hero: 22,
    films: [
      ['Dr. No', 1962, 'tt0055928'], ['From Russia with Love', 1963, 'tt0057076'], ['Goldfinger', 1964, 'tt0058150'], ['Thunderball', 1965, 'tt0059800'], ['You Only Live Twice', 1967, 'tt0062512'],
      ["On Her Majesty's Secret Service", 1969, 'tt0064757'], ['Diamonds Are Forever', 1971, 'tt0066995'], ['Live and Let Die', 1973, 'tt0070328'], ['The Man with the Golden Gun', 1974, 'tt0071807'],
      ['The Spy Who Loved Me', 1977, 'tt0076752'], ['Moonraker', 1979, 'tt0079574'], ['For Your Eyes Only', 1981, 'tt0082398'], ['Octopussy', 1983, 'tt0086034'], ['A View to a Kill', 1985, 'tt0090264'],
      ['The Living Daylights', 1987, 'tt0093428'], ['Licence to Kill', 1989, 'tt0097742'], ['GoldenEye', 1995, 'tt0113189'], ['Tomorrow Never Dies', 1997, 'tt0120347'], ['The World Is Not Enough', 1999, 'tt0143145'],
      ['Die Another Day', 2002, 'tt0246460'], ['Casino Royale', 2006, 'tt0381061'], ['Quantum of Solace', 2008, 'tt0830515'], ['Skyfall', 2012, 'tt1074638'], ['Spectre', 2015, 'tt2379713'], ['No Time to Die', 2021, 'tt2382320'],
    ],
  },
  {
    id: 'mi', name: 'Mission : Impossible', tagline: 'Votre mission, si vous l’acceptez…', cat: 'action', color: '#ff3b30', hero: 5,
    films: [
      ['Mission: Impossible', 1996, 'tt0117060'], ['Mission: Impossible II', 2000, 'tt0120755'], ['Mission: Impossible III', 2006, 'tt0317919'], ['Mission: Impossible - Ghost Protocol', 2011, 'tt1229238'],
      ['Mission: Impossible - Rogue Nation', 2015, 'tt2381249'], ['Mission: Impossible - Fallout', 2018, 'tt4912910'], ['Mission: Impossible - Dead Reckoning Part One', 2023, 'tt9603212'],
      ['Mission: Impossible - The Final Reckoning', 2025, 'tt9603208'],
    ],
  },
  {
    id: 'fast', name: 'Fast & Furious', tagline: 'La vitesse, les voitures et surtout… la famille.', cat: 'action', color: '#ff7a00', hero: 4,
    films: [
      ['The Fast and the Furious', 2001, 'tt0232500'], ['2 Fast 2 Furious', 2003, 'tt0322259'], ['The Fast and the Furious: Tokyo Drift', 2006, 'tt0463985'], ['Fast & Furious', 2009, 'tt1013752'],
      ['Fast Five', 2011, 'tt1596343'], ['Fast & Furious 6', 2013, 'tt1905041'], ['Furious 7', 2015, 'tt2820852'], ['The Fate of the Furious', 2017, 'tt4630562'],
      ['Fast & Furious Presents: Hobbs & Shaw|Hobbs & Shaw', 2019, 'tt6806448'], ['F9|F9: The Fast Saga', 2021, 'tt5433138'], ['Fast X', 2023, 'tt5433140'],
    ],
    chrono: [0, 1, 3, 4, 5, 2, 6, 7, 8, 9, 10],
  },
  {
    id: 'johnwick', name: 'John Wick', tagline: 'Il ne fallait pas toucher à son chien.', cat: 'action', color: '#e8c547', hero: 3,
    films: [
      ['John Wick', 2014, 'tt2911666'], ['John Wick: Chapter 2', 2017, 'tt4425200'], ['John Wick: Chapter 3 - Parabellum', 2019, 'tt6146586'], ['John Wick: Chapter 4', 2023, 'tt10366206'],
      ['Ballerina|From the World of John Wick: Ballerina', 2025, 'tt7181546'],
    ],
    chrono: [0, 1, 2, 4, 3],
  },
  {
    id: 'diehard', name: 'Die Hard', tagline: 'John McClane, toujours au mauvais endroit au mauvais moment.', cat: 'action', color: '#ffb000',
    films: [['Die Hard', 1988, 'tt0095016'], ['Die Hard 2', 1990, 'tt0099423'], ['Die Hard with a Vengeance', 1995, 'tt0112864'], ['Live Free or Die Hard', 2007, 'tt0337978'], ['A Good Day to Die Hard', 2013, 'tt1606378']],
  },
  {
    id: 'bourne', name: 'Jason Bourne', tagline: 'Un espion amnésique qui cherche qui il est.', cat: 'action', color: '#64b5f6',
    films: [['The Bourne Identity', 2002, 'tt0258463'], ['The Bourne Supremacy', 2004, 'tt0372183'], ['The Bourne Ultimatum', 2007, 'tt0440963'], ['The Bourne Legacy', 2012, 'tt1194173'], ['Jason Bourne', 2016, 'tt4196776']],
  },
  {
    id: 'rambo', name: 'Rambo', tagline: 'Sylvester Stallone, un soldat qu’on n’arrête pas.', cat: 'action', color: '#7c8b3a',
    films: [['First Blood|Rambo: First Blood', 1982, 'tt0083944'], ['Rambo: First Blood Part II', 1985, 'tt0089880'], ['Rambo III', 1988, 'tt0095956'], ['Rambo', 2008, 'tt0462499'], ['Rambo: Last Blood', 2019, 'tt1206885']],
  },
  {
    id: 'lethal', name: 'L’Arme fatale', tagline: 'Riggs et Murtaugh : « Je suis trop vieux pour ces conneries. »', cat: 'action', color: '#ef5350',
    films: [['Lethal Weapon', 1987, 'tt0093409'], ['Lethal Weapon 2', 1989, 'tt0097733'], ['Lethal Weapon 3', 1992, 'tt0104714'], ['Lethal Weapon 4', 1998, 'tt0122151']],
  },
  {
    id: 'badboys', name: 'Bad Boys', tagline: 'Will Smith et Martin Lawrence à Miami.', cat: 'action', color: '#ffca28',
    films: [['Bad Boys', 1995, 'tt0112442'], ['Bad Boys II', 2003, 'tt0172156'], ['Bad Boys for Life', 2020, 'tt1502397'], ['Bad Boys: Ride or Die', 2024, 'tt4919268']],
  },
  {
    id: 'taken', name: 'Taken', tagline: 'Je vais vous trouver, et je vais vous tuer.', cat: 'action', color: '#90a4ae',
    films: [['Taken', 2008, 'tt0936501'], ['Taken 2', 2012, 'tt1397280'], ['Taken 3', 2014, 'tt2446042']],
  },
  {
    id: 'expendables', name: 'Expendables', tagline: 'Toutes les légendes de l’action dans le même film.', cat: 'action', color: '#b0703a',
    films: [['The Expendables', 2010, 'tt1320253'], ['The Expendables 2', 2012, 'tt1764651'], ['The Expendables 3', 2014, 'tt2333784'], ['Expend4bles|The Expendables 4', 2023, 'tt3291150']],
  },
  {
    id: 'equalizer', name: 'Equalizer', tagline: 'Denzel Washington fait justice lui-même.', cat: 'action', color: '#78909c',
    films: [['The Equalizer', 2014, 'tt0455944'], ['The Equalizer 2', 2018, 'tt3766354'], ['The Equalizer 3', 2023, 'tt17024450']],
  },
  {
    id: 'kingsman', name: 'Kingsman', tagline: 'Les bonnes manières font l’homme.', cat: 'action', color: '#c9a45c',
    films: [['Kingsman: The Secret Service', 2014, 'tt2802144'], ['Kingsman: The Golden Circle', 2017, 'tt4649466'], ["The King's Man", 2021, 'tt6856242']],
    chrono: [2, 0, 1],
  },
  {
    id: 'topgun', name: 'Top Gun', tagline: 'Maverick, toujours aussi rapide.', cat: 'action', color: '#ff9f43', hero: 1,
    films: [['Top Gun', 1986, 'tt0092099'], ['Top Gun: Maverick', 2022, 'tt1745960']],
  },
  {
    id: 'beverly', name: 'Le Flic de Beverly Hills', tagline: 'Eddie Murphy dans la peau d’Axel Foley.', cat: 'action', color: '#26c6da',
    films: [['Beverly Hills Cop', 1984, 'tt0086960'], ['Beverly Hills Cop II', 1987, 'tt0092644'], ['Beverly Hills Cop III', 1994, 'tt0109254'], ['Beverly Hills Cop: Axel F', 2024, 'tt3083016']],
  },
  {
    id: 'transporter', name: 'Le Transporteur', tagline: 'Jason Statham, trois règles et une Audi.', cat: 'action', color: '#9e9e9e',
    films: [['The Transporter', 2002, 'tt0293662'], ['Transporter 2', 2005, 'tt0388482'], ['Transporter 3', 2008, 'tt1129442']],
  },
  {
    id: 'reacher', name: 'Jack Reacher', tagline: 'Tom Cruise en ancien flic militaire.', cat: 'action', color: '#8d6e63',
    films: [['Jack Reacher', 2012, 'tt0790724'], ['Jack Reacher: Never Go Back', 2016, 'tt3393786']],
  },
  {
    id: 'kickass', name: 'Kick-Ass', tagline: 'Des super-héros sans super-pouvoirs.', cat: 'action', color: '#9ccc65',
    films: [['Kick-Ass', 2010, 'tt1250777'], ['Kick-Ass 2', 2013, 'tt1650554']],
  },
  {
    id: 'sicario', name: 'Sicario', tagline: 'La guerre des cartels à la frontière mexicaine.', cat: 'action', color: '#d7a86e',
    films: [['Sicario', 2015, 'tt3397884'], ['Sicario: Day of the Soldado', 2018, 'tt5052474']],
  },

  // ---------- Animation ----------
  {
    id: 'toystory', name: 'Toy Story', tagline: 'Vers l’infini et au-delà !', cat: 'animation', color: '#4fc3f7',
    films: [['Toy Story', 1995, 'tt0114709'], ['Toy Story 2', 1999, 'tt0120363'], ['Toy Story 3', 2010, 'tt0435761'], ['Toy Story 4', 2019, 'tt1979376']],
  },
  {
    id: 'shrek', name: 'Shrek', tagline: 'L’ogre le plus attachant du royaume de Fort Fort Lointain.', cat: 'animation', color: '#9ccc3c',
    films: [['Shrek', 2001, 'tt0126029'], ['Shrek 2', 2004, 'tt0298148'], ['Shrek the Third', 2007, 'tt0413267'], ['Shrek Forever After', 2010, 'tt0892791'], ['Puss in Boots', 2011, 'tt0448694'], ['Puss in Boots: The Last Wish', 2022, 'tt3915174']],
    chrono: [4, 0, 1, 2, 3, 5],
  },
  {
    id: 'despicable', name: 'Moi, moche et méchant', tagline: 'Gru et ses Minions.', cat: 'animation', color: '#ffd600',
    films: [['Despicable Me', 2010, 'tt1323594'], ['Despicable Me 2', 2013, 'tt1690953'], ['Minions', 2015, 'tt2293640'], ['Despicable Me 3', 2017, 'tt3469046'], ['Minions: The Rise of Gru', 2022, 'tt5113044'], ['Despicable Me 4', 2024, 'tt7510222']],
    chrono: [2, 4, 0, 1, 3, 5],
  },
  {
    id: 'iceage', name: 'L’Âge de glace', tagline: 'Manny, Sid, Diego… et Scrat et son gland.', cat: 'animation', color: '#81d4fa',
    films: [['Ice Age', 2002, 'tt0268380'], ['Ice Age: The Meltdown', 2006, 'tt0438097'], ['Ice Age: Dawn of the Dinosaurs', 2009, 'tt1080016'], ['Ice Age: Continental Drift', 2012, 'tt1667889'], ['Ice Age: Collision Course', 2016, 'tt3416828']],
  },
  {
    id: 'dragons', name: 'Dragons', tagline: 'Harold et Krokmou, l’amitié d’un Viking et d’un dragon.', cat: 'animation', color: '#5c6bc0',
    films: [['How to Train Your Dragon', 2010, 'tt0892769'], ['How to Train Your Dragon 2', 2014, 'tt1646971'], ['How to Train Your Dragon: The Hidden World', 2019, 'tt2386490']],
  },
  {
    id: 'kungfupanda', name: 'Kung Fu Panda', tagline: 'Po, le Guerrier Dragon le plus gourmand.', cat: 'animation', color: '#ffb74d',
    films: [['Kung Fu Panda', 2008, 'tt0441773'], ['Kung Fu Panda 2', 2011, 'tt1302011'], ['Kung Fu Panda 3', 2016, 'tt2267968'], ['Kung Fu Panda 4', 2024, 'tt21692408']],
  },
  {
    id: 'madagascar', name: 'Madagascar', tagline: 'Alex, Marty, Gloria, Melman… et les pingouins.', cat: 'animation', color: '#ffa726',
    films: [['Madagascar', 2005, 'tt0351283'], ['Madagascar: Escape 2 Africa', 2008, 'tt0479952'], ["Madagascar 3: Europe's Most Wanted", 2012, 'tt1277953'], ['Penguins of Madagascar', 2014, 'tt1911658']],
  },
  {
    id: 'spiderverse', name: 'Spider-Verse', tagline: 'Miles Morales et les Spider-Man du multivers.', cat: 'animation', color: '#ff2d6f', hero: 1,
    films: [['Spider-Man: Into the Spider-Verse', 2018, 'tt4633694'], ['Spider-Man: Across the Spider-Verse', 2023, 'tt9362722']],
  },
  {
    id: 'cars', name: 'Cars', tagline: 'Flash McQueen, Martin et la route 66.', cat: 'animation', color: '#e53935',
    films: [['Cars', 2006, 'tt0317219'], ['Cars 2', 2011, 'tt1216475'], ['Cars 3', 2017, 'tt3606752']],
  },
  {
    id: 'incredibles', name: 'Les Indestructibles', tagline: 'Une famille de super-héros presque normale.', cat: 'animation', color: '#ff5722',
    films: [['The Incredibles', 2004, 'tt0317705'], ['Incredibles 2', 2018, 'tt3606756']],
  },
  {
    id: 'monsters', name: 'Monstres & Cie', tagline: 'Sulli, Bob et le pouvoir des rires.', cat: 'animation', color: '#26a69a',
    films: [['Monsters, Inc.', 2001, 'tt0198781'], ['Monsters University', 2013, 'tt1453405']],
    chrono: [1, 0],
  },
  {
    id: 'nemo', name: 'Le Monde de Nemo', tagline: 'Nemo, Marin et Dory au fond de l’océan.', cat: 'animation', color: '#ff9800',
    films: [['Finding Nemo', 2003, 'tt0266543'], ['Finding Dory', 2016, 'tt2277860']],
  },
  {
    id: 'insideout', name: 'Vice-versa', tagline: 'Joie, Tristesse, Colère, Peur et Dégoût.', cat: 'animation', color: '#ffd54f',
    films: [['Inside Out', 2015, 'tt2096673'], ['Inside Out 2', 2024, 'tt22022452']],
  },
  {
    id: 'frozen', name: 'La Reine des neiges', tagline: 'Libérée, délivrée…', cat: 'animation', color: '#90caf9',
    films: [['Frozen', 2013, 'tt2294629'], ['Frozen II', 2019, 'tt4520988']],
  },
  {
    id: 'lionking', name: 'Le Roi lion', tagline: 'Le cycle de la vie, de Mufasa à Simba.', cat: 'animation', color: '#ffb300',
    films: [['The Lion King', 1994, 'tt0110357'], ['The Lion King', 2019, 'tt6105098'], ['Mufasa: The Lion King', 2024, 'tt13186482']],
    chrono: [2, 0, 1],
  },
  {
    id: 'moana', name: 'Vaiana', tagline: 'L’océan l’a choisie.', cat: 'animation', color: '#26c6da',
    films: [['Moana', 2016, 'tt3521164'], ['Moana 2', 2024, 'tt13622970']],
  },
  {
    id: 'zootopia', name: 'Zootopie', tagline: 'Judy Hopps et Nick Wilde mènent l’enquête.', cat: 'animation', color: '#7cb342',
    films: [['Zootopia', 2016, 'tt2948356'], ['Zootopia 2', 2025, 'tt26443597']],
  },
  {
    id: 'hoteltransylvania', name: 'Hôtel Transylvanie', tagline: 'Dracula ouvre un hôtel pour monstres.', cat: 'animation', color: '#ab47bc',
    films: [['Hotel Transylvania', 2012, 'tt0837562'], ['Hotel Transylvania 2', 2015, 'tt2510894'], ['Hotel Transylvania 3: Summer Vacation', 2018, 'tt5220122'], ['Hotel Transylvania: Transformania', 2022, 'tt9848626']],
  },

  // ---------- Horreur ----------
  {
    id: 'conjuring', name: 'Conjuring', tagline: 'Les enquêtes d’Ed et Lorraine Warren, Annabelle et la Nonne.', cat: 'horror', color: '#9b8bd6',
    films: [
      ['The Conjuring', 2013, 'tt1457767'], ['Annabelle', 2014, 'tt3322940'], ['The Conjuring 2', 2016, 'tt3065204'], ['Annabelle: Creation', 2017, 'tt5140878'], ['The Nun', 2018, 'tt5814060'],
      ['The Curse of La Llorona', 2019, 'tt4913966'], ['Annabelle Comes Home', 2019, 'tt8350360'], ['The Conjuring: The Devil Made Me Do It', 2021, 'tt7069210'], ['The Nun II', 2023, 'tt10160976'],
      ['The Conjuring: Last Rites', 2025, 'tt22898462'],
    ],
    chrono: [4, 3, 8, 1, 0, 6, 5, 2, 7, 9],
  },
  {
    id: 'saw', name: 'Saw', tagline: 'Voulez-vous jouer à un jeu ?', cat: 'horror', color: '#b71c1c',
    films: [
      ['Saw', 2004, 'tt0387564'], ['Saw II', 2005, 'tt0432348'], ['Saw III', 2006, 'tt0489270'], ['Saw IV', 2007, 'tt0890870'], ['Saw V', 2008, 'tt1132626'], ['Saw VI', 2009, 'tt1233227'], ['Saw 3D|Saw: The Final Chapter', 2010, 'tt1477076'],
      ['Jigsaw', 2017, 'tt3348730'], ['Spiral|Spiral: From the Book of Saw', 2021, 'tt10342730'], ['Saw X', 2023, 'tt21807222'],
    ],
    chrono: [0, 9, 1, 2, 3, 4, 5, 6, 7, 8],
  },
  {
    id: 'scream', name: 'Scream', tagline: 'Quel est ton film d’horreur préféré ?', cat: 'horror', color: '#e0e0e0',
    films: [['Scream', 1996, 'tt0117571'], ['Scream 2', 1997, 'tt0120082'], ['Scream 3', 2000, 'tt0134084'], ['Scream 4', 2011, 'tt1262416'], ['Scream', 2022, 'tt11245972'], ['Scream VI', 2023, 'tt17663992'], ['Scream 7', 2026]],
  },
  {
    id: 'halloween', name: 'Halloween', tagline: 'Michael Myers rentre à la maison.', cat: 'horror', color: '#ff7518',
    films: [
      ['Halloween', 1978, 'tt0077651'], ['Halloween II', 1981, 'tt0082495'], ['Halloween III: Season of the Witch', 1982, 'tt0085636'], ['Halloween 4: The Return of Michael Myers', 1988, 'tt0095271'],
      ['Halloween 5: The Revenge of Michael Myers', 1989, 'tt0097474'], ['Halloween: The Curse of Michael Myers', 1995, 'tt0113253'], ['Halloween H20: 20 Years Later', 1998, 'tt0120694'],
      ['Halloween: Resurrection', 2002, 'tt0220506'], ['Halloween', 2007, 'tt0373883'], ['Halloween II', 2009, 'tt1311067'], ['Halloween', 2018, 'tt1502407'], ['Halloween Kills', 2021, 'tt10665338'], ['Halloween Ends', 2022, 'tt10665342'],
    ],
  },
  {
    id: 'elmstreet', name: 'Les Griffes de la nuit', tagline: 'Freddy Krueger vous attend dans vos rêves.', cat: 'horror', color: '#c62828',
    films: [
      ['A Nightmare on Elm Street', 1984, 'tt0087800'], ["A Nightmare on Elm Street 2: Freddy's Revenge", 1985, 'tt0089686'], ['A Nightmare on Elm Street 3: Dream Warriors', 1987, 'tt0093629'],
      ['A Nightmare on Elm Street 4: The Dream Master', 1988, 'tt0095742'], ['A Nightmare on Elm Street 5: The Dream Child', 1989, 'tt0097981'], ["Freddy's Dead: The Final Nightmare", 1991, 'tt0101917'],
      ["Wes Craven's New Nightmare|New Nightmare", 1994, 'tt0111686'], ['Freddy vs. Jason', 2003, 'tt0329101'], ['A Nightmare on Elm Street', 2010, 'tt1179056'],
    ],
  },
  {
    id: 'friday13', name: 'Vendredi 13', tagline: 'Jason Voorhees et le camp de Crystal Lake.', cat: 'horror', color: '#8d9e5a',
    films: [
      ['Friday the 13th', 1980, 'tt0080761'], ['Friday the 13th Part 2', 1981, 'tt0082418'], ['Friday the 13th Part III', 1982, 'tt0083972'], ['Friday the 13th: The Final Chapter', 1984, 'tt0087298'],
      ['Friday the 13th: A New Beginning', 1985, 'tt0089173'], ['Friday the 13th Part VI: Jason Lives', 1986, 'tt0091080'], ['Friday the 13th Part VII: The New Blood', 1988, 'tt0095179'],
      ['Friday the 13th Part VIII: Jason Takes Manhattan', 1989, 'tt0097388'], ['Jason Goes to Hell: The Final Friday', 1993, 'tt0107254'], ['Jason X', 2001, 'tt0211443'], ['Freddy vs. Jason', 2003, 'tt0329101'],
      ['Friday the 13th', 2009, 'tt0758746'],
    ],
  },
  {
    id: 'insidious', name: 'Insidious', tagline: 'Le Lointain, l’au-delà où errent les esprits.', cat: 'horror', color: '#ef5350',
    films: [['Insidious', 2010, 'tt1591095'], ['Insidious: Chapter 2', 2013, 'tt2226417'], ['Insidious: Chapter 3', 2015, 'tt3195644'], ['Insidious: The Last Key', 2018, 'tt5726086'], ['Insidious: The Red Door', 2023, 'tt13405778']],
    chrono: [2, 3, 0, 1, 4],
  },
  {
    id: 'finaldestination', name: 'Destination finale', tagline: 'On ne triche pas avec la mort.', cat: 'horror', color: '#ffab40',
    films: [['Final Destination', 2000, 'tt0195714'], ['Final Destination 2', 2003, 'tt0309593'], ['Final Destination 3', 2006, 'tt0414982'], ['The Final Destination', 2009, 'tt1144884'], ['Final Destination 5', 2011, 'tt1622979'], ['Final Destination Bloodlines', 2025, 'tt9619824']],
    chrono: [4, 0, 1, 2, 3, 5],
  },
  {
    id: 'purge', name: 'American Nightmare', tagline: 'Une nuit par an, tous les crimes sont permis.', cat: 'horror', color: '#e53935',
    films: [['The Purge', 2013, 'tt2184339'], ['The Purge: Anarchy', 2014, 'tt2975578'], ['The Purge: Election Year', 2016, 'tt4094724'], ['The First Purge', 2018, 'tt6133466'], ['The Forever Purge', 2021, 'tt10327252']],
    chrono: [3, 0, 1, 2, 4],
  },
  {
    id: 'paranormal', name: 'Paranormal Activity', tagline: 'La caméra tourne pendant que vous dormez.', cat: 'horror', color: '#7e8fa6',
    films: [
      ['Paranormal Activity', 2007, 'tt1179904'], ['Paranormal Activity 2', 2010, 'tt1536044'], ['Paranormal Activity 3', 2011, 'tt1778304'], ['Paranormal Activity 4', 2012, 'tt2109184'],
      ['Paranormal Activity: The Marked Ones', 2014, 'tt2473682'], ['Paranormal Activity: The Ghost Dimension', 2015, 'tt2752724'],
    ],
    chrono: [2, 1, 0, 3, 4, 5],
  },
  {
    id: 'evildead', name: 'Evil Dead', tagline: 'Le Necronomicon et une cabane au fond des bois.', cat: 'horror', color: '#8bc34a',
    films: [['The Evil Dead', 1981, 'tt0083907'], ['Evil Dead II', 1987, 'tt0092991'], ['Army of Darkness', 1992, 'tt0106308'], ['Evil Dead', 2013, 'tt1288558'], ['Evil Dead Rise', 2023, 'tt13345606']],
  },
  {
    id: 'quietplace', name: 'Sans un bruit', tagline: 'S’ils vous entendent, ils vous chassent.', cat: 'horror', color: '#a1887f',
    films: [['A Quiet Place', 2018, 'tt6644200'], ['A Quiet Place Part II', 2020, 'tt8332922'], ['A Quiet Place: Day One', 2024, 'tt13433802']],
    chrono: [2, 0, 1],
  },
  {
    id: 'it', name: 'Ça', tagline: 'Grippe-Sou et le Club des Ratés.', cat: 'horror', color: '#e53935',
    films: [['It', 2017, 'tt1396484'], ['It Chapter Two', 2019, 'tt7349950']],
  },
  {
    id: 'exorcist', name: 'L’Exorciste', tagline: 'Le film d’horreur le plus célèbre de l’histoire, et ses suites.', cat: 'horror', color: '#b0bec5',
    films: [
      ['The Exorcist', 1973, 'tt0070047'], ['Exorcist II: The Heretic', 1977, 'tt0076009'], ['The Exorcist III', 1990, 'tt0099528'], ['Exorcist: The Beginning', 2004, 'tt0204313'],
      ['Dominion: Prequel to the Exorcist', 2005, 'tt0449086'], ['The Exorcist: Believer', 2023, 'tt12921446'],
    ],
  },
  {
    id: '28days', name: '28 jours plus tard', tagline: 'Le virus de la fureur ravage la Grande-Bretagne.', cat: 'horror', color: '#d32f2f',
    films: [['28 Days Later', 2002, 'tt0289043'], ['28 Weeks Later', 2007, 'tt0463854'], ['28 Years Later', 2025, 'tt10548174'], ['28 Years Later: The Bone Temple', 2026]],
  },
  {
    id: 'residentevil', name: 'Resident Evil', tagline: 'Alice contre Umbrella Corporation.', cat: 'horror', color: '#c62828',
    films: [
      ['Resident Evil', 2002, 'tt0120804'], ['Resident Evil: Apocalypse', 2004, 'tt0318627'], ['Resident Evil: Extinction', 2007, 'tt0432021'], ['Resident Evil: Afterlife', 2010, 'tt1220634'],
      ['Resident Evil: Retribution', 2012, 'tt1855325'], ['Resident Evil: The Final Chapter', 2016, 'tt2592614'],
    ],
  },
  {
    id: 'underworld', name: 'Underworld', tagline: 'La guerre millénaire des vampires et des lycans.', cat: 'horror', color: '#5c7fa3',
    films: [['Underworld', 2003, 'tt0320691'], ['Underworld: Evolution', 2006, 'tt0401855'], ['Underworld: Rise of the Lycans', 2009, 'tt0834001'], ['Underworld: Awakening', 2012, 'tt1496025'], ['Underworld: Blood Wars', 2016, 'tt3717252']],
    chrono: [2, 0, 1, 3, 4],
  },
  {
    id: 'jaws', name: 'Les Dents de la mer', tagline: 'Vous allez avoir besoin d’un plus gros bateau.', cat: 'horror', color: '#1e88e5',
    films: [['Jaws', 1975, 'tt0073195'], ['Jaws 2', 1978, 'tt0077766'], ['Jaws 3-D', 1983, 'tt0085750'], ['Jaws: The Revenge', 1987, 'tt0093300']],
  },

  // ---------- Comédie ----------
  {
    id: 'ghostbusters', name: 'SOS Fantômes', tagline: 'Qui vous allez appeler ?', cat: 'comedy', color: '#e53935',
    films: [['Ghostbusters', 1984, 'tt0087332'], ['Ghostbusters II', 1989, 'tt0097428'], ['Ghostbusters', 2016, 'tt1289401'], ['Ghostbusters: Afterlife', 2021, 'tt4513678'], ['Ghostbusters: Frozen Empire', 2024, 'tt21235248']],
  },
  {
    id: 'hangover', name: 'Very Bad Trip', tagline: 'Ce qui se passe à Las Vegas reste à Las Vegas.', cat: 'comedy', color: '#ffb300',
    films: [['The Hangover', 2009, 'tt1119646'], ['The Hangover Part II', 2011, 'tt1411697'], ['The Hangover Part III', 2013, 'tt1951261']],
  },
  {
    id: 'americanpie', name: 'American Pie', tagline: 'La bande de lycéens la plus gênante du cinéma.', cat: 'comedy', color: '#ff8a65',
    films: [['American Pie', 1999, 'tt0163651'], ['American Pie 2', 2001, 'tt0252866'], ['American Wedding', 2003, 'tt0328828'], ['American Reunion', 2012, 'tt1605630']],
  },
  {
    id: 'homealone', name: 'Maman, j’ai raté l’avion !', tagline: 'Kevin, seul à la maison pour Noël.', cat: 'comedy', color: '#d32f2f',
    films: [['Home Alone', 1990, 'tt0099785'], ['Home Alone 2: Lost in New York', 1992, 'tt0104431']],
  },
  {
    id: 'meetparents', name: 'Mon beau-père et moi', tagline: 'Robert De Niro, le beau-père de l’enfer.', cat: 'comedy', color: '#4db6ac',
    films: [['Meet the Parents', 2000, 'tt0212338'], ['Meet the Fockers', 2004, 'tt0290002'], ['Little Fockers', 2010, 'tt0970866']],
  },
  {
    id: 'austinpowers', name: 'Austin Powers', tagline: 'Yeah, baby !', cat: 'comedy', color: '#ec407a',
    films: [['Austin Powers: International Man of Mystery', 1997, 'tt0118655'], ['Austin Powers: The Spy Who Shagged Me', 1999, 'tt0145660'], ['Austin Powers in Goldmember', 2002, 'tt0295178']],
  },
  {
    id: 'scarymovie', name: 'Scary Movie', tagline: 'La parodie de tous les films d’horreur.', cat: 'comedy', color: '#ffee58',
    films: [['Scary Movie', 2000, 'tt0175142'], ['Scary Movie 2', 2001, 'tt0257106'], ['Scary Movie 3', 2003, 'tt0306047'], ['Scary Movie 4', 2006, 'tt0362120'], ['Scary Movie 5', 2013, 'tt0795461']],
  },
  {
    id: 'rushhour', name: 'Rush Hour', tagline: 'Jackie Chan et Chris Tucker, le duo explosif.', cat: 'comedy', color: '#ff7043',
    films: [['Rush Hour', 1998, 'tt0120812'], ['Rush Hour 2', 2001, 'tt0266915'], ['Rush Hour 3', 2007, 'tt0293564']],
  },
  {
    id: 'museum', name: 'La Nuit au musée', tagline: 'Quand le musée ferme, tout prend vie.', cat: 'comedy', color: '#a1887f',
    films: [['Night at the Museum', 2006, 'tt0477347'], ['Night at the Museum: Battle of the Smithsonian', 2009, 'tt1078912'], ['Night at the Museum: Secret of the Tomb', 2014, 'tt2692250']],
  },
  {
    id: 'paddington', name: 'Paddington', tagline: 'L’ours le plus poli de Londres.', cat: 'comedy', color: '#1976d2',
    films: [['Paddington', 2014, 'tt1109624'], ['Paddington 2', 2017, 'tt4468740'], ['Paddington in Peru', 2024, 'tt5822536']],
  },
  {
    id: 'sonic', name: 'Sonic', tagline: 'Le hérisson bleu le plus rapide du monde.', cat: 'comedy', color: '#2979ff',
    films: [['Sonic the Hedgehog', 2020, 'tt3794354'], ['Sonic the Hedgehog 2', 2022, 'tt12412888'], ['Sonic the Hedgehog 3', 2024, 'tt18259086']],
  },
  {
    id: 'jumpstreet', name: '21 Jump Street', tagline: 'Deux flics infiltrés à la fac.', cat: 'comedy', color: '#ffca28',
    films: [['21 Jump Street', 2012, 'tt1232829'], ['22 Jump Street', 2014, 'tt2294449']],
  },
  {
    id: 'bridget', name: 'Bridget Jones', tagline: 'Le journal le plus drôle de Londres.', cat: 'comedy', color: '#f48fb1',
    films: [["Bridget Jones's Diary", 2001, 'tt0243155'], ['Bridget Jones: The Edge of Reason', 2004, 'tt0317198'], ["Bridget Jones's Baby", 2016, 'tt1473832'], ['Bridget Jones: Mad About the Boy', 2025]],
  },

  // ---------- Culte & polar ----------
  {
    id: 'godfather', name: 'Le Parrain', tagline: 'Une offre qu’on ne peut pas refuser.', cat: 'cult', color: '#c8a165',
    films: [['The Godfather', 1972, 'tt0068646'], ['The Godfather Part II', 1974, 'tt0071562'], ['The Godfather Part III', 1990, 'tt0099674']],
  },
  {
    id: 'rocky', name: 'Rocky & Creed', tagline: 'Rocky Balboa, puis Adonis Creed.', cat: 'cult', color: '#d32f2f',
    films: [
      ['Rocky', 1976, 'tt0075148'], ['Rocky II', 1979, 'tt0079817'], ['Rocky III', 1982, 'tt0084602'], ['Rocky IV', 1985, 'tt0089927'], ['Rocky V', 1990, 'tt0100507'], ['Rocky Balboa', 2006, 'tt0479143'],
      ['Creed', 2015, 'tt3076658'], ['Creed II', 2018, 'tt6343314'], ['Creed III', 2023, 'tt11145118'],
    ],
  },
  {
    id: 'hannibal', name: 'Hannibal Lecter', tagline: 'Le docteur Lecter vous attend pour dîner.', cat: 'cult', color: '#8e2430',
    films: [['The Silence of the Lambs', 1991, 'tt0102926'], ['Hannibal', 2001, 'tt0212985'], ['Red Dragon', 2002, 'tt0289765'], ['Hannibal Rising', 2007, 'tt0367959']],
    chrono: [3, 2, 0, 1],
  },
  {
    id: 'killbill', name: 'Kill Bill', tagline: 'La vengeance de la Mariée, par Quentin Tarantino.', cat: 'cult', color: '#ffd600',
    films: [['Kill Bill: Vol. 1', 2003, 'tt0266697'], ['Kill Bill: Vol. 2', 2004, 'tt0378194']],
  },
  {
    id: 'dollars', name: 'La Trilogie du dollar', tagline: 'Clint Eastwood, l’homme sans nom de Sergio Leone.', cat: 'cult', color: '#d9a35b', hero: 2,
    films: [['A Fistful of Dollars', 1964, 'tt0058461'], ['For a Few Dollars More', 1965, 'tt0059578'], ['The Good, the Bad and the Ugly', 1966, 'tt0060196']],
  },
  {
    id: 'before', name: 'Before Sunrise', tagline: 'Céline et Jesse, une histoire d’amour sur dix-huit ans.', cat: 'cult', color: '#ffab91',
    films: [['Before Sunrise', 1995, 'tt0112471'], ['Before Sunset', 2004, 'tt0381681'], ['Before Midnight', 2013, 'tt2209418']],
  },
  {
    id: 'unbreakable', name: 'Incassable', tagline: 'La trilogie de super-héros de M. Night Shyamalan.', cat: 'cult', color: '#80cbc4',
    films: [['Unbreakable', 2000, 'tt0217869'], ['Split', 2016, 'tt4972582'], ['Glass', 2019, 'tt6823368']],
  },
  {
    id: 'gladiator', name: 'Gladiator', tagline: 'Ce que l’on fait dans sa vie résonne dans l’éternité.', cat: 'cult', color: '#d4a373',
    films: [['Gladiator', 2000, 'tt0172495'], ['Gladiator II', 2024, 'tt9218128']],
  },
  {
    id: 'joker', name: 'Joker', tagline: 'Joaquin Phoenix en Arthur Fleck.', cat: 'cult', color: '#7cb342',
    films: [['Joker', 2019, 'tt7286456'], ['Joker: Folie à Deux|Joker: Folie a Deux', 2024, 'tt11315808']],
  },
  {
    id: 'oceans', name: 'Ocean’s', tagline: 'Danny Ocean et sa bande de cambrioleurs de luxe.', cat: 'cult', color: '#ffd54f',
    films: [["Ocean's Eleven", 2001, 'tt0240772'], ["Ocean's Twelve", 2004, 'tt0349903'], ["Ocean's Thirteen", 2007, 'tt0496806'], ["Ocean's 8", 2018, 'tt5164214']],
  },
  {
    id: 'knivesout', name: 'À couteaux tirés', tagline: 'Les enquêtes de Benoit Blanc.', cat: 'cult', color: '#bcaaa4',
    films: [['Knives Out', 2019, 'tt8946378'], ['Glass Onion: A Knives Out Mystery|Glass Onion', 2022, 'tt11564570'], ['Wake Up Dead Man: A Knives Out Mystery|Wake Up Dead Man', 2025, 'tt14364480']],
  },
  {
    id: 'sherlock', name: 'Sherlock Holmes', tagline: 'Robert Downey Jr. et Jude Law à Londres.', cat: 'cult', color: '#a1887f',
    films: [['Sherlock Holmes', 2009, 'tt0988045'], ['Sherlock Holmes: A Game of Shadows', 2011, 'tt1515091']],
  },
  {
    id: 'nowyouseeme', name: 'Insaisissables', tagline: 'Des magiciens qui braquent des banques.', cat: 'cult', color: '#7e57c2',
    films: [['Now You See Me', 2013, 'tt1670345'], ['Now You See Me 2', 2016, 'tt3110958'], ["Now You See Me: Now You Don't", 2025, 'tt4712810']],
  },
  {
    id: 'dirtyharry', name: 'L’Inspecteur Harry', tagline: 'Clint Eastwood et son Magnum 44.', cat: 'cult', color: '#90a4ae',
    films: [['Dirty Harry', 1971, 'tt0066999'], ['Magnum Force', 1973, 'tt0070355'], ['The Enforcer', 1976, 'tt0074483'], ['Sudden Impact', 1983, 'tt0086383'], ['The Dead Pool', 1988, 'tt0094963']],
  },

  // ---------- Made in France ----------
  {
    id: 'asterix', name: 'Astérix et Obélix', tagline: 'Ils sont fous ces Romains !', cat: 'france', color: '#ffc107', hero: 1,
    films: [
      ['Asterix & Obelix Take On Caesar|Astérix et Obélix contre César', 1999], ['Asterix & Obelix: Mission Cleopatra|Astérix et Obélix Mission Cléopâtre', 2002, 'tt0250223'],
      ['Asterix at the Olympic Games|Astérix aux Jeux olympiques', 2008, 'tt0463872'], ['Asterix & Obelix: God Save Britannia|Astérix et Obélix au service de Sa Majesté', 2012],
      ["Asterix & Obelix: The Middle Kingdom|Astérix et Obélix L'Empire du Milieu", 2023],
    ],
  },
  {
    id: 'visiteurs', name: 'Les Visiteurs', tagline: 'Okayyy ! Godefroy et Jacquouille à travers le temps.', cat: 'france', color: '#c0a062',
    films: [['The Visitors|Les visiteurs', 1993, 'tt0108500'], ['The Visitors II: The Corridors of Time|Les couloirs du temps', 1998], ['The Visitors: Bastille Day|Les visiteurs la révolution', 2016]],
  },
  {
    id: 'taxi', name: 'Taxi', tagline: 'Daniel, sa 406 et les rues de Marseille.', cat: 'france', color: '#ffeb3b',
    films: [['Taxi', 1998, 'tt0152930'], ['Taxi 2', 2000], ['Taxi 3', 2003], ['Taxi 4', 2007], ['Taxi 5', 2018]],
  },
  {
    id: 'oss117', name: 'OSS 117', tagline: 'Jean Dujardin, l’espion le plus sûr de lui de la République.', cat: 'france', color: '#d4af37',
    films: [['OSS 117: Cairo, Nest of Spies|OSS 117 Le Caire nid d’espions', 2006, 'tt0464913'], ['OSS 117: Lost in Rio|OSS 117 Rio ne répond plus', 2009, 'tt1167660'], ['OSS 117: From Africa with Love|OSS 117 Alerte rouge en Afrique noire', 2021]],
  },
  {
    id: 'gendarme', name: 'Le Gendarme de Saint-Tropez', tagline: 'Louis de Funès et la brigade de Saint-Tropez.', cat: 'france', color: '#42a5f5',
    films: [
      ['The Troops of St. Tropez|Le gendarme de Saint-Tropez', 1964], ['The Gendarme in New York|Le gendarme à New York', 1965],
      ['The Gendarme Gets Married|Le gendarme se marie', 1968], ['The Gendarme Takes Off|Le gendarme en balade', 1970],
      ['The Gendarme and the Creatures from Outer Space|Le gendarme et les extra-terrestres', 1979], ['The Gendarme and the Gendarmettes|Le gendarme et les gendarmettes', 1982],
    ],
  },
  {
    id: 'fantomas', name: 'Fantômas', tagline: 'Louis de Funès et Jean Marais contre le génie du crime.', cat: 'france', color: '#66bb6a',
    films: [['Fantomas|Fantômas', 1964], ['Fantomas Unleashed|Fantômas se déchaîne', 1965], ['Fantomas vs. Scotland Yard|Fantômas contre Scotland Yard', 1967]],
  },
  {
    id: 'bronzes', name: 'Les Bronzés', tagline: 'La troupe du Splendid en vacances.', cat: 'france', color: '#ff8a65',
    films: [['French Fried Vacation|Les bronzés', 1978], ['French Fried Vacation 2|Les bronzés font du ski', 1979], ['French Fried Vacation 3|Les bronzés 3 amis pour la vie', 2006]],
  },
  {
    id: 'tuche', name: 'Les Tuche', tagline: 'La famille de Bouzolles, du loto à l’Élysée.', cat: 'france', color: '#ffb74d',
    films: [['Les Tuche|The Tuche Family', 2011], ['Les Tuche 2', 2016], ['Les Tuche 3', 2018], ['Les Tuche 4', 2021]],
  },
  {
    id: 'bondieu', name: 'Qu’est-ce qu’on a fait au Bon Dieu ?', tagline: 'Claude et Marie Verneuil, et leurs quatre gendres.', cat: 'france', color: '#4fc3f7',
    films: [
      ["Serial (Bad) Weddings|Qu'est-ce qu'on a fait au Bon Dieu", 2014], ["Serial (Bad) Weddings 2|Qu'est-ce qu'on a encore fait au Bon Dieu", 2019],
      ["Serial (Bad) Weddings 3|Qu'est-ce qu'on a tous fait au Bon Dieu", 2022],
    ],
  },
  {
    id: 'camping', name: 'Camping', tagline: 'Patrick Chirac et les Flots Bleus.', cat: 'france', color: '#29b6f6',
    films: [['Camping', 2006], ['Camping 2', 2010], ['Camping 3', 2016]],
  },
  {
    id: 'b13', name: 'Banlieue 13', tagline: 'Parkour et action, produits par Luc Besson.', cat: 'france', color: '#ef6c00',
    films: [['District B13|Banlieue 13', 2004], ['District 13: Ultimatum|Banlieue 13 Ultimatum', 2009]],
  },
  {
    id: 'mousquetaires', name: 'Les Trois Mousquetaires', tagline: 'D’Artagnan et Milady, la fresque de cape et d’épée.', cat: 'france', color: '#b08d57',
    films: [["The Three Musketeers: D'Artagnan|Les Trois Mousquetaires D'Artagnan", 2023], ['The Three Musketeers: Milady|Les Trois Mousquetaires Milady', 2023]],
  },
  {
    id: 'kaamelott', name: 'Kaamelott', tagline: 'Arthur, les chevaliers de la Table ronde et le Graal.', cat: 'france', color: '#c9a227',
    films: [['Kaamelott: The First Chapter|Kaamelott Premier volet', 2021], ['Kaamelott: Deuxième volet|Kaamelott Deuxième volet partie 1', 2025]],
  },
];
