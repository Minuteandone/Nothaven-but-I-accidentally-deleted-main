# Beacon of Stormhaven — player guide

[Play in your browser](https://stormhaven-rpg.pages.dev) · [Project README](../README.md)

## Quick briefings

First-time quick briefings appear in the title, town, exploration and combat screens, and a level-up briefing names any skills Wren actually unlocks. They stay inline until you dismiss them, never spend a turn, and store only dismissal preferences on this device. To show them again, open **How to play** on the title screen and choose **Replay quick tips**.

## Starting without spoilers

- Choose **New journey**, speak to Warden Mara in Greyhaven, and read the quest journal below the main panels. You can also speak to Iven and Tamsin for context.
- **Explore the wilds** opens the map. Use its movement buttons, WASD, or the arrow keys. Nearby actions appear as you approach people, landmarks, enemies, and exits. A fight that is not yet open, because it awaits a story step or landmark inspections, appears on the map as a “Sealed challenge” and keeps its foe’s name hidden until it unlocks. Beneath the map, the Terrain compass lists open and blocked adjacent ways based on terrain walkability. The Expedition log groups consecutive repeats and shows six recent entries. When older entries are retained, Show earlier entries reveals them; Show recent entries only restores the shorter view. This viewing choice is not saved and never spends a turn.
- **Display settings → Letter & number shortcuts** can turn off WASD, E (Survey), combat letters, and numbered actions for speech input or personal preference. Arrow movement, Escape, and native buttons still work. This device-local preference is separate from your saved journey; Reset display turns these shortcuts back on.
- Walk to new regions to discover them before using their travel shortcuts. Some passages also require quest progress.
- **Inspect landmarks and open caches explicitly.** Standing on a chest is not the same as taking its supplies. Read nearby action labels when you reach an objective.
- **Pin an objective** in the Journey journal to show its current instructions in town and exploration. One pin is kept at a time; its text follows your progress, and a completed pin stays marked completed until you unpin it. Your manual quick save and Journey Archive checkpoints preserve the selection; pinning does not save automatically or accept a job.
- **Journey archive** keeps three separate manual checkpoints. Open it in town or exploration to save a slot, or from the title screen to load one. Replacing or deleting an occupied slot requires confirmation; loading asks before replacing your unsaved journey. **Save journey / Save Game** and **Continue** still use the separate quick save. Archive slots are device-local, do not synchronize, and never save automatically.
- **Portable archive backups:** first save a Journey Archive slot, choose **Export slot**, then select and copy the entire text into a file you keep. On another browser/device, open Journey Archive (also available from the title), paste the text, choose **Preview into slot 1, 2, or 3**, check the incoming journey and destination, then **Confirm import**. Even empty slots require confirmation. Import replaces only that checkpoint; it does not load it, change your current journey, or replace the quick save. Use **Load slot** separately when ready. Text is local, editable JSON, not an authenticated record; only import text you trust. Format checks reject unsupported versions, combat snapshots, oversized text (over 250,000 characters), excessively deep/large structures and unsafe object keys, but do not verify earned progress. Leaving the archive clears unimported text and export panels; no cloud upload or automatic synchronization occurs.
- Use **Save journey** in town or **Save Game** while exploring. Saves are local to this browser/device; **Continue** on the title screen resumes your saved journey. Do not rely on automatic saving or cross-device synchronization.
- Combat is turn-based: nothing attacks while you decide. Read **Skills** and **Items**, not just Attack. Healing and defensive skills can make a longer fight manageable; fleeing is not available against bosses. Attack and damaging skills show an estimated damage range, items show what they would restore on their target right now (for example “On Wren now: +12 HP.”), and a line beneath the foe estimates its basic hit, or an unleashed heavy blow, against your current defenses. Outside boss fights, the Flee button shows your current escape odds as a percentage: they start at 50% and move 10 percentage points for each point of speed you have above or below the foe, bounded from 0% to 90%. Healing, cleansing and revival skills likewise show their immediate effect on each target (for example “If used now: Wren +10 HP.”), capped at maximum HP and naming any conditions they would clear, before your companions act or the foe replies — not a prediction of end-of-turn health. **The Action order panel shows this sequence, labels downed allies “Down now” (they are skipped unless revived before their formation turn), marks a stunned enemy’s skipped reply, and explains a faster foe’s single opening turn before your first command.** Against late bosses and field trials, trading blows alone often falls short: raise Beacon Aegis or Warding Stance before a gathered heavy blow lands, restore the party with Rallying Light or Stormhaven Vigil before health runs low, clear shock with Steady Signal, and keep Rekindle ready for a fallen companion — a party that stays standing keeps dealing damage over a long fight. When the foe’s next blow could knock out your leader at their current health, a “Knockout risk:” line appears beneath that estimate, naming the threat and what still helps: Defend or a ward to halve it, healing before it lands, or a stun or Stillpoint Strike to break a gathered heavy blow. Once a foe is down to half health or less, a “Finishing blow:” line names the attacks and skills you can use now whose estimate reaches its remaining health: “will defeat” when even the lowest roll is enough, or “could defeat … on a high roll” when only the top of the range is.
- Every boss and field trial can spend a turn **gathering a heavy blow**: about one and a half times a normal hit for the Tide Wraith; a little more for the four field trials (Old Tusk, Gloomfin, Frostmane and the Lenswarden); nearly twice for the Drowned Harbormaster, the Highwatch Warlord, the Relay Warden, Cinderclaw, Thunderhoof and the Glacierward Colossus; and twice for the Stormcrown Tyrant, the Storm’s Heart and the Last Squall. A warning appears under the foe: Defend or a ward halves the strike on the next turn, and stunning the foe or landing a Stillpoint Strike breaks it. A **Break!** flash over the foe confirms the blow was scattered, and **Braced!** appears over the hero who blunted a release with Defend or a ward. When a boss is worn down far enough to turn desperate, a red **Enraged!** flash over it marks its harder-hitting second phase. Foes with such a second phase also show a tick on their HP bar and, beneath it, a line such as “Enrage threshold: 120 HP or lower.” naming exactly when that phase begins. After a victory, the outcome panel also lists the experience and gold earned and any items found, in a line such as “+10 XP · +9 gold”.
- After some hard-fought victories, a spoils panel offers a one-time choice between three bonus bundles; take one or leave them and continue on your way.
- Watch the **Beacon Charge** gauge. Attacks, skills, defending and taking hits fill it; when it is full, **Beacon Burst** strikes for heavy damage that ignores defense and clears bleeding and shock. Burst is not a skill, so it still works while you are shocked.
- New equipment must be **equipped**, not merely bought. Shops also have Sell and Craft tabs; inspect recipe requirements before selling materials. The shop Craft tab has a Craft all button that repeats a recipe while materials last. The exploration Field Pack summarizes your carried stacks by category and offers ready-to-craft recipes when you have their ingredients. Recipes that use rare drops can only be crafted one at a time. The Buy tab’s quantity stepper picks how many the Buy button purchases at once (up to 99), while Buy 5 and Buy & equip stay unchanged. Each row’s Buy max button purchases as many of that item as your gold allows, up to 99 at once. The Sell tab’s quantity stepper picks how many the Sell N button sells from a stack (Sell 1 and Sell all stay unchanged, and rare drops can only be sold one at a time). Trading posts at Saltmere and the Relay Outpost add a Trade tab that swaps common materials for glass at rates that favor the shop; rare drops are never tradable. Trade all repeats the selected trade while its materials last.
- Visit the **Watch House muster board** in town as allies unlock. Your active party has three slots including Wren. Dismissed companions become reserves rather than being deleted. With two companions deployed, Move earlier and Move later swap their roster order without spending a turn; Wren stays first. Companions act in that order after Wren, and if one ends the battle, later allies do not act. The chosen order is retained in your save.
- Companions grow with the party. At **level 8** each masters a signature technique: Iven’s **Keeper’s Mend** heals 50% more, Bram’s **Bulwark Bash** triggers more often (35%) and hits harder, Sela’s **Bright Flare** deals 50% more damage, and Tamsin’s **Piercing Shot** fires more often (40%) at ×1.7 power.
- In combat **Items**, choose a living **Item recipient** before using a supply. Wren is selected each time you open Items; selecting a recipient or returning to commands spends no turn. Using an item spends one turn, including companion actions and the enemy reply. Number shortcuts still choose items, not recipients. Ordinary supplies cannot revive downed allies.
- In combat, **Tactics** (**T**) sets each living companion to **Automatic** or **Conserve MP**. Automatic keeps their usual behavior; Conserve MP replaces Iven’s Mend/Spark and Sela’s Signal Flare with ordinary attacks, even when someone needs healing. Tamsin and Bram retain their free techniques. Choosing a tactic spends no turn; Escape returns to commands. Preferences stay with companions in reserve and are kept when you save.
- Wren keeps learning into the postgame: **Rekindle** (level 15) revives every knocked-out ally at 40% health with conditions cleared, **Skyfire Lance** (level 17) is an armour-piercing strike at 260% power, and **Stormhaven Vigil** (level 19, 16 MP) restores 35% of maximum health to every standing ally and clears bleeding and shock. Rekindle does nothing (and costs no MP) if nobody has fallen, and like other support skills it is blocked while Wren is shocked. Stormhaven Vigil, like Steady Signal, can be used while shocked, but it cannot lift a fallen ally. At the level cap, **Stillpoint Strike** (level 20, 13 MP) is an armour-piercing strike at 200% power that also breaks any heavy blow the foe is gathering, and it can be used while shocked.
- Paid rests restore the active party and clear statuses. Bring remedies for bleeding and shock on longer trips. If Wren falls, defeat costs half your gold, rounded down, and returns the party to Greyhaven; quest progress remains.
- The **Warden’s field journal** reveals enemy information after victories. Its field tips are useful preparation for rematches and related threats. Use **Compare** on up to three recorded foes for a side-by-side tactical tray; Remove or Clear comparison changes no progress. Recorded bosses also show their windup name, gathering chance, next-action strike at Wren, and counterplay in both views; unknown foes stay hidden. Windup multipliers scale ATK before defense, not final damage. Use **All / Bosses / Regular** to filter the catalogue, or enter a recorded foe’s name and choose **Search**. Unknown names cannot be searched; **Clear search** restores their placeholders within the chosen category. Progress totals and the comparison tray stay unfiltered. Search and category choices reset when you reopen the journal; they never unlock entries or change your save.
- The town **Difficulty** button cycles Standard → Veteran → Stormborn → Story → Standard. Standard is unchanged; Story gives foes 75% HP and 80% attack, while Veteran gives them 130% HP and 120% attack with 125% gold, and Stormborn gives them 160% HP and 140% attack with 150% gold. Values are rounded, the setting is saved, and it applies to newly started fights.
- Music and sound are optional. Use the audio controls if you want them; the game does not require sound.

### When a quest seems stuck

1. Read its current journal objective rather than repeating the last fight.
2. Check whether it asks you to **inspect** something after winning.
3. Return to Greyhaven for town reports. Later commissions use explicit **Accept** and **Report** buttons; ordinary conversation does not submit them.
4. Expand **Companion commissions** to see those separate requests.
5. Earlier discoveries count for later commissions, but discovering everything does not itself accept or pay a request.

---

## Walkthrough — story and reward spoilers below

The five chapters share one save. The first beacon ending is permanent, but it is not the end of exploration. Choose **Keep exploring** after an ending to continue.

### 1. Relight the beacon

1. Speak to Mara. Leave Greyhaven through the **East Gate** for Ridge Road and clear the road patrol.
2. Report to Mara, then speak to Iven about the lens.
3. Take Ridge Road’s **North Ascent** to Observatory Ruins. Defeat the Observatory Sentinel and return to Iven.
4. Consult Mara and Tamsin, then visit Beacon Tower through the observatory’s **North Causeway**. If you explored the tower earlier, visit it again after the council conversations.
5. Make your permanent beacon choice: protect Greyhaven or share the light along the distant roads. The result changes the story, not your ability to play the following chapters.

The three main payments total **105 gold** (20 + 35 + 50). Find the **Lost Ridge Dispatch** and **Observatory Dispatch**, then speak to Tamsin for a separate **15 gold**. Beacon Tower has a **Signal Lift** home.

After the beacon choice, **First Light Relief** asks for **2 rations and 1 bandage**. Buy or find them, then explicitly hand them over in Greyhaven for **30 gold once**. Buying all three from Hesta costs 22 gold. This is optional and independent of the settlement expedition.

Hesta’s Goods also sells the **Tin Whistle** trinket for **25 gold** (+5 HP), an affordable first accessory while you save for better weapons and armor.

### 2. Open both rescue routes

Accept Mara’s relief expedition in Greyhaven. Complete these routes in either order:

| Route | How to reach it | Required task |
|---|---|---|
| Saltmere Coast | Greyhaven’s **South Pier** | Clear the reef creatures at the coastal rescue crossing. |
| Highwatch Pass | Ridge Road’s **North Trail** | Clear the frost wolves at the supply crossing. |

Return to Greyhaven and explicitly report both safe routes for **80 gold once**. The first route you cleared is remembered. The Drowned Harbormaster and Pass Warlord are **optional bosses**, not substitutes for the rescue encounters.

Tamsin and Iven unlock through the earlier road and observatory victories; Bram and Sela unlock through the respective settlement rescue victories. Use the muster board to recruit them. Saltmere’s trading post sells coastal equipment if you want an upgrade before pushing inland.
Its signature weapon is the **Warden’s Blade** (**180 gold**, ATK +12), a solid step up from the iron sword.

### 3. Restore the inland relay

After reporting both rescues, accept **A Signal of Our Own** in Greyhaven.

1. Enter **Sunscar Relay** through Highwatch’s **East Gate**.
2. Inspect the **Relay Capacitor Junction**.
3. Defeat the **Relay Warden** and inspect the **Master Relay Console**.
4. While beside the console, make one permanent service choice for **100 gold once**:
   - **Shelter network:** paid rests cost **2 gold instead of 5**.
   - **Route network:** random wandering encounters occur **half as often**. Fixed enemies remain.

Neither choice replaces your original beacon ending. The **Sunscar Relay Outpost** offers inland gear and supplies; the region’s **Signal Lift** returns to Greyhaven. If you explored before accepting, your completed tasks remain valid—accept in town, then return to the console to choose.

### 4. Survey Stormcrown Spire

Accept **Above the Gathering Storm** in Greyhaven after choosing the relay service. From Sunscar Relay, take the **Spire Switchback**.

1. Inspect the **Western Storm-Survey Archive** and **Eastern Barometer Logbook**.
2. Prepare at the **Stormcrown Trading Post**; the expedition cache is another source of supplies.
3. Defeat the **Stormcrown Tyrant**.
4. Inspect the **Stormcrown Summit Cradle**, which is guarded until the Tyrant falls.
5. Return by the **Signal Lift** and explicitly report for **150 gold once**.

This report opens the **Stormhaven Endures** finale once. Keep exploring afterward. The passage beyond the summit remains locked until you have actually submitted this survey report, even if the Tyrant is already defeated.

### 5. Optional: investigate the Storm’s Heart

After the summit report, accept **The Storm’s Heart** in Greyhaven. Return to the spire summit and take the **Summit Passage** into **The Storm’s Eye**.

- The trading post and supply cache are reachable before the anchor fights. Upgrade with money you have already earned; the final reward is not an advance.
- Defeat the **western Tempest Shade**, then inspect the **Western Lightning Anchor**.
- Defeat the **eastern Thunderhead Colossus**, then inspect the **Eastern Lightning Anchor**.
- Either anchor order works. The core remains inaccessible until **both anchors have been inspected**, not merely their guardians defeated.
- Defeat **the Storm’s Heart** at the central core. You can use the Signal Lift to rest and return before this fight; inspected anchors remain grounded.
- Return to Greyhaven and explicitly report for **200 gold once**. If you explored before accepting, accept now; those discoveries still count.

Defeating the exact core immediately halves random encounters in **Stormcrown Spire and the Storm’s Eye**, even before reporting. The route-network benefit stacks, making those encounters one quarter as likely as their original rate. Other regions, fixed enemies, and ordinary weather are not removed.

Your original beacon choice, relay service, and earlier rewards remain unchanged. The report does not automatically replay an ending. **Read the chronicle** in town lets you revisit the ending and credits with the completed chapter’s aftermath; **Back to Greyhaven** returns without paying rewards again. Once you finish postgame challenges such as the Last Squall, Cinderclaw, Signal Calibration, Supply Lines, the Glacierward Colossus or a fully claimed bounty board, the chronicle also lists them under **Beyond the storm**. Its **Your journey** list also names your current difficulty setting and the companions available to you, tallies battles won (with boss victories), foes recorded in the Field Journal, Wardens’ Feats earned out of thirty-one, any sparring drills won (with your best Yard Gauntlet run), and — after your first claim — your bounty board record. Beneath the feats tally, a “Closest to earning:” line names the unearned feat you are nearest to completing, matching the hint on the feats screen. Beneath the bounty board record, a “Notices answered:” line counts the different contracts you have claimed at least once, as on the board itself.

#### Optional challenge: The Last Squall

After you claim the **Heart report reward**, a final storm gathers on the northern causeway of **the Storm’s Eye**. **The Last Squall** is an optional trial far stronger than the Storm’s Heart. Level **15 or higher** with your best gear is recommended; keep Beacon Aegis up and save a Beacon Burst for when it draws in every storm. Victory grants experience, gold and materials only. It records a journal entry but pays no report reward and changes no ending, so you can leave it be.

#### Crafting the squall-grade gear

Three **craft-only** upgrades appear in every shop’s **Craft** tab and the town **Field Recipe Book** once you hold their inputs: **Squall Cleaver** (Tempest Edge + 3 Thunder Iron + 1 Stormcrown Shard), **Squall Bulwark** (Maelstrom Plate + 3 Thunder Iron + 1 Stormcrown Shard) and **Squall Sigil** (Stormeye Signet + 2 Thunder Iron + 2 Storm Glass, with no shard required). None of them are ever sold outright. Stormcrown Shards drop from the Stormcrown Tyrant, the Storm’s Heart and The Last Squall, with a rare chance from the Thunderhead Colossus.

#### Optional survey: The Long Watch

After claiming the **Heart report reward**, explicitly accept **The Long Watch** in Greyhaven. This survey is independent of **The Last Squall**; you do not need to fight that optional boss.

Take **fresh readings after accepting** at all three repeatable stations, in any order:

- **Saltmere Harbor Lamp:** south from Greyhaven, at the pier’s southern end.
- **Highwatch Signal Cairn:** through Ridge Road’s north trail, at the northern overlook.
- **Observatory Forecast Stand:** through Ridge Road’s north ascent, beside the old lens pedestal. The stand is a separate, repeatable landmark; the recovered lens is not moved or collected again.

Old inspections do **not** count, unlike the earlier companion requests. You can save between readings. Return to Greyhaven and explicitly **report the three readings for 180 gold once**; conversation alone neither accepts nor pays. The completed journal records the shared forecast timetable. This survey changes no ending, combat difficulty, or encounter rate; ordinary storms and road threats remain.

#### Optional ordered survey: Signal Calibration

After **reporting The Long Watch and receiving its reward**, explicitly accept **Signal Calibration** in Greyhaven. Take fresh readings in order: **Eye Reference Gauge** on the Storm’s Eye lower platform (3,5), **Eastern Barometer Logbook** on Stormcrown Spire’s eastern parapet (7,3), then **Relay Capacitor Junction** on Sunscar’s northern terrace (3,1). Earlier or out-of-order inspections do not count; the Journey Journal always identifies the next step. Return to Greyhaven and explicitly report for **220 gold**. Talking alone pays nothing. Reporting also earns the **True Interval** feat. The survey changes no ending, beacon reach, relay benefit, or combat statistics.

### Optional companion commissions

Expand **Companion commissions** in Greyhaven. Each unlocks with its companion; you do **not** need that companion recruited or in the active party. Accept, complete both tasks, and explicitly report in Greyhaven.

| Request | Fixed enemy | Landmark to inspect | Reward |
|---|---|---|---:|
| Tamsin — The Scout’s Missing Route | Ridge Road’s hound den | Lost Ridge Dispatch | 25 gold |
| Iven — The Keeper’s Second Look | Eastern observatory construct | Refractory Lens Pedestal | 35 gold |
| Bram — A Lamp for the Late Boats | Drowned Harbormaster | Saltmere Harbor Lamp | 45 gold |
| Sela — The Runner’s Bearings | Rockslide Golem | Highwatch Signal Cairn | 45 gold |

These are one-time requests. Their exact fixed enemies matter: defeating the same species on a wandering patrol does not replace the requested encounter. Earlier victories and inspections count; an older save may need the repeatable harbor lamp or cairn inspected again.

### Repeatable expedition board

After the summit report, Greyhaven offers the first two patrol contracts:

- **Sunscar Road Patrol:** defeat **2 Dust Marauders**, then claim **35 gold** in town.
- **Stormcrown Sentry Patrol:** defeat **2 Spire Sentries**, then claim **60 gold** in town.
- **Storm’s Eye Sweep:** after claiming the **Heart report reward**, defeat **2 Tempest Shades**, then claim **90 gold** in town. Defeating the core alone does not unlock this contract.

Accept one contract at a time, then use patrols to seek new victories. Earlier kills do not count. Matching victories advance the quota but **do not automatically pay**; return and claim the reward. You may accept the same contract again from zero. Cancelling discards progress and gives no payment.

### Frontier wanderers

Four wandering foes can appear on the early roads in addition to the familiar patrols. They are never required, and the fixed story encounters are unchanged.

| Foe | Where it roams | What to watch for | Counter |
|---|---|---|---|
| Briar Boar | Ridge Road | **Thorn Gore** hits about 1.4× harder | Defending halves the next hit; Warding Stance helps too |
| Lens Wisp | Observatory Ruins | **Prism Glare** can leave you **shocked** | Plain attacks still work; Steady Signal or Burst clears it |
| Wrack Eel | Saltmere Coast | **Coiling Bite** causes **bleeding** | Rallying Light or a bandage stops the bleed |
| Rime Wight | Highwatch Pass | **Numbing Frost** can leave you **shocked** | Keep a storm tonic handy and lean on attacks |

**Old Tusk (optional ridge trial).** Once Saltmere and Highwatch are home and you have reported to Mara, the grey king of the briar boars appears on a Ridge Road ledge. His **Bramble Charge** causes heavy bleeding and he hits harder below half health, so bring bandages or Rallying Light. He is a one-off field challenge: nothing depends on him and he does not join the sparring drills.

**Gloomfin (optional coast trial).** After the same report, a giant storm-charged wrack eel starts hunting off Saltmere's north seawall. Its **Riptide Shock** leaves you shocked, which blocks most skills, so carry storm tonics and keep Steady Signal or Burst ready. Like Old Tusk, it is a one-off field challenge that stays out of the sparring drills.

**Frostmane (optional heights trial).** After that report, the white-maned leader of the Highwatch wolf packs prowls the southern bastion of Highwatch Pass. Its **Rime Fang** opens bleeding wounds, so bring bandages or field dressings and keep Rallying Light ready. It is another one-off field challenge that stays out of the sparring drills.

**The Lenswarden (optional observatory trial).** The same report unseals the northeast vault of the Observatory Ruins, where the old opticians’ brass guardian still stands watch. It is a construct, so Spark and Signal Flare deal extra damage, but its **Focused Beam** leaves you shocked: pack storm tonics or keep Steady Signal ready. Like the other field trials, it never appears in the sparring drills.

**Cinderclaw (optional plateau trial).** Once the Stormcrown Spire is settled and Mara has paid for it, a giant sand scorpion surfaces in the dunes below the Sunscar signal lift. It is much tougher than the four rescue-era trials (plan on level 9 or higher). Its **Searing Sting** opens bleeding wounds and it can gather a **Pincer Vise**, so Defend on the warning and carry bandages or field dressings. It is a separate challenge: it does not count toward Trial Warden and never appears in the sparring drills. Its one unique drop is the **Cinder Stinger** trinket (+3 atk, +1 def, +2 spd), which no shop sells.

**Thunderhoof (optional ridge trial).** After you report Signal Calibration and Mara pays for it, a storm-charged elk starts roaming the lower bend of the Ridge Road. It is one of the hardest optional fights (plan on level 14 or higher with a full party). Its **Arcing Antlers** leave you shocked, so keep a cleanse or Stormhaven Vigil ready, and Defend when it gathers a **Stampede Rush**. Like Cinderclaw it is a separate challenge: it does not count toward Trial Warden and never appears in the sparring drills. It drops thunder iron, storm glass and ember broth for the forge and the road, and sometimes its one unique drop, the **Sparkrack Tine** trinket (+3 atk, +6 MP, +3 spd), which no shop sells.

**Glacierward Colossus (optional Highwatch trial).** The same paid calibration wakes an old guardian of stone and blue ice by the south wall of Highwatch Pass (east of Captain Rusk). It is tougher than Thunderhoof (plan on level 16 or higher with a full party), and its ice plating shrugs off weak blows. Its **Rime Shard Volley** leaves you bleeding, so keep Rallying Light, Steady Signal or Stormhaven Vigil ready, and Defend when it gathers a **Glacier Slam**. It is a separate challenge outside Trial Warden and the sparring drills. It drops thunder iron, storm glass, relay brass and spiced broth, and sometimes a **Frostward Cloak**.

Each adds an entry to the bestiary, so they help toward the **catalogue** feat. Their drops are ordinary supplies such as healing herbs, storm glass, field dressings, and tonics.

### Elements and the elemental wheel

Five elements shape every battle: **Fire melts Ice**, **Ice grounds Lightning**, **Lightning parts Water**, and **Water douses Fire**. **Earth** stands neutral, neither strong nor weak against any element.

Some skills carry an element: Spark, Stormbreaker and Tempest Cleave (Lightning), Beacon Lance, Signal Flare and Skyfire Lance (Fire), and Stillpoint Strike (Ice). Basic attacks are untyped and ignore the wheel altogether.

Enemies have elemental affinities too — a Gale Hound is Lightning, a Cinderclaw is Fire, a Wrack Eel is Water. Check the coloured badge under an enemy's name during combat to plan your moves.

Super-effective hits deal **1.5× damage** and flash *It's super effective!* in the battle log. Resisted hits deal **0.75×** and warn *It's not very effective…* Earth-element foes still show their badge but never multiply or resist damage.

Companion techniques get elements too: Iven's Spark is Lightning, and Sela's Signal Flare is Fire, both making full use of the wheel.


### Greyhaven forge: weapon and armour fittings

Choose **Greyhaven forge** in town to have Hesta fit each party member's weapon and armour slots, up to +3 each. A weapon fitting adds +2 attack per level. An armour fitting adds +1 defence and +4 max HP per level. Fittings belong to the wearer's slot, so they carry over when that member changes gear, but they only help while something is equipped there.

| Level | Cost (either slot) |
|---|---|
| +1 | 30 gold, 2 Scrap Metal |
| +2 | 70 gold, 2 Storm Glass, 1 Scrap Metal |
| +3 | 140 gold, 2 Relay Brass, 1 Storm Glass |

Current fitting levels appear on each member's character sheet and beside equipped gear in the bag. Bringing both fittings on one member to +3 earns the **Well Fitted** feat.

### Watch House yard: drills, gauntlet and feats

Greyhaven's **Sparring drills** board lets you refight the yard bosses you have already defeated in the field, one bout at a time. Optional field trials (Old Tusk, Gloomfin, Frostmane and the Lenswarden) are not part of the yard. Each drill pays **half that foe's experience to every party member**, but no gold, items, or journal entries — it is pure practice and cannot change the story. Defeating a boss in the field unlocks its drill. Each drill records how many times you have won and your best (fewest) rounds. A summary line above the roster counts the drills you have unlocked, the foes you have bested in drills and your total drill victories. Beneath it, a hint names the next unlocked drill you have not yet won or, once all are won, the one with your slowest best time. Each unlocked drill also names its foe’s element and which skill elements hit it harder or are resisted (for example “Element: Water. Lightning skills hit it harder; Fire skills are resisted.”). A line beneath it lists the foe’s health, attack, defense and speed at your current difficulty (for example “Foe at Standard: 50 HP · 10 attack · 4 defense · 6 speed.”). A drill you have not unlocked yet names where its boss waits in the field (for example “Found in: Beacon Tower.”).

Once **three** drills are unlocked, the **Yard Gauntlet** opens beside them: face every unlocked drill boss back to back, with wounds and spent MP carrying over between bouts. Losing ends the run but costs nothing — no gold is lost and the party stands back up. Your best run (foes beaten in one attempt) is recorded. Beneath the record, a target line tracks the Unbroken Run feat: until every yard boss is unlocked it counts how many are, and afterwards it shows how many more foes your best run must beat. During a drill or Gauntlet bout, a “Drill record:” line beneath the foe shows the record that bout is competing for and what winning it would set. Once it opens, a “Bout order:” line lists the unlocked yard bosses in the order the run will face them. Beneath it, a “Bout elements:” line counts how many of those bouts each skill element hits harder or is resisted by, so you can plan which skills to lean on.

**Bounty board.** The Greyhaven bounty board posts eighteen repeatable hunts against roaming foes, from the Ridge Road Rat Cull to Thunder over the Eye. A contract opens once that foe is in your Field Journal, and each posted notice lists the regions where its target roams. Beneath the claim count, a line such as “Notices posted: 5 of 18.” shows how many contracts the board has opened so far. After your first claim, a “Notices answered:” line counts how many different contracts you have claimed at least once, toward the “Every Notice Answered” feat. Beneath it, a “Still unclaimed:” line names up to three posted contracts you have never claimed, in board order. Each posted notice also shows its target’s health, attack, defense and speed at your current difficulty, and its element with the skill elements that hit it harder or are resisted. Take one at a time, defeat the listed number in the wilds (roaming ambushes and patrols both count; sparring drills do not), then return to the board to claim gold and crafting materials such as scrap metal, storm glass and relay brass. You can abandon a contract at no cost, and every contract can be taken again. While a contract is active, its progress (or a reminder to claim it) shows in the town square, on the exploration screen (which also notes whether the target roams there), and in the Journey Journal. During a battle against your contract’s target, a “Bounty target:” line beneath the foe shows your progress and what winning that battle will bring it to. When no contract is active, the town square instead names the current urgent notice and any Board Marks you have to spend. After your first claim, the town square also shows your board rank and how many more claims the next rank needs. Each claim also counts toward a board rank — Contract Hand at 3 claims, Board Regular at 8, Ridge Tracker at 15 and Warden of the Board at 25 — which raises the gold every contract pays by 10% per rank, up to +40%. Your current rank and total claims also appear in the Service record on the Feats page. Beside them, a “Notices answered” row counts the different contracts you have claimed at least once, out of all eighteen. Region buttons on the board narrow the posted notices to the hunts roaming one region; your active contract always stays in view. One contract at a time is marked urgent and pays an extra 25% of its base gold on top of your rank (if it is still unposted, the board says so without naming it); the urgent mark moves to another contract after every claim. Claim the same contract three times and it is mastered: every later claim of it pays one extra of its first listed item, and the board counts how many contracts you have mastered. Sort buttons list the posted notices in board order, by highest pay, by fewest claims, or by easiest hunt (the least total base health across all the foes a contract asks for, shown on each posted notice as a line such as “Hunt total: 48 base HP across 4 foes.”); unposted notices always stay at the bottom. Claimed contracts that are not yet mastered show how many of the three claims you have made toward mastery. After your first claim, the Journey Journal keeps a board record of your total claims, current rank, mastered contracts and lifetime Board Marks earned. The same record appears under “Your journey” on the ending screen. Each recorded roaming foe’s Field Journal entry also lists the regions it roams and its board contract, with your claims on it and any active progress. Every claim also earns Board Marks — 1 for the first six postings, 2 for the next six and 3 for the last six — which the Board Exchange beneath the contracts trades for supplies: two Field Dressings, a Highland Flask, a Spiced Broth, Storm Glass, Relay Brass, Sunscar Glass or Thunder Iron. Reaching the Warden of the Board rank takes one mark off the price of every offer. Each offer also shows how many of that item are already in your pack. Above the offers, a line counts how many you can afford with your available marks and names the cheapest one still out of reach with the marks it needs.

The **Wardens' feats** panel lists milestones of your journey. Alongside the chapter milestones it tracks sixteen yard, road, forge and record achievements:

- **Yard Champion** — win a Sparring Drill against every boss in the Watch House yard.
- **Unbroken Run** — clear the full Yard Gauntlet against every yard boss without a single loss.
- **Roadwise** — defeat each of the four frontier wanderers described above.
- **Tusk Breaker** — defeat Old Tusk, the optional Ridge Road trial described above.
- **Seawall Sentinel** — defeat Gloomfin, the optional Saltmere Coast trial described above.
- **Packbreaker** — defeat Frostmane, the optional Highwatch Pass trial described above.
- **Vault Keeper** — defeat the Lenswarden, the optional Observatory Ruins trial described above.
- **Trial Warden** — overcome all four optional field trials (Old Tusk, Gloomfin, Frostmane and the Lenswarden).
- **Dune Breaker** — defeat Cinderclaw, the optional Sunscar plateau trial described above. It does not count toward Trial Warden.
- **Stampede Stopped** — defeat Thunderhoof, the optional ridge trial unlocked by paid Signal Calibration. It does not count toward Trial Warden.
- **Thaw the Sentinel** — defeat the Glacierward Colossus, the optional Highwatch Pass trial unlocked by paid Signal Calibration. It does not count toward Trial Warden.
- **Undaunted** — win a battle after being carried home from a defeat.
- **Steady Road** — win fifteen real battles in a row without a defeat. Fleeing does not break the run.
- **Calm in the Gale** — overcome any boss in a real battle while the Difficulty is set to Stormborn. Sparring drills do not count.
- **Well Fitted** — have the Greyhaven forge bring both the weapon and armour fittings of one party member to +3.
- **Every Notice Answered** — claim every contract on the Greyhaven bounty board at least once.

Use the **All**, **Earned** and **Not yet** buttons above the list to show only the feats you want; the earned count stays the same and the choice resets each time you open the panel. Below the earned count, a short line names the next feat you have not yet earned, in list order. Each filter button shows how many feats it would list. Once you have earned a feat, the town square also shows your feat count and the title of the next feat still to earn. The Journey Journal repeats that feat line and, once you have won a drill or attempted the Yard Gauntlet, adds a training yard line with your drill victories, the foes you have bested in drills and your best gauntlet run. Feats that count toward a target, such as level, contracts or drill wins, show your progress beneath their description until earned (for example “Progress: 2 of 4.”). Beneath the next unearned feat, a second line names the unearned feat whose target is closest to complete, by share of the target already reached (for example “Closest to earning: Full Muster (2 of 3).”). In a real battle whose victory would complete a feat tracked by your field journal, such as a field trial, the last frontier wanderer or your tenth recorded foe, a “Feat in reach:” line beneath the foe names those feats; story, level, streak and difficulty feats are not forecast. When a real victory completes one or more feats, the victory summary adds a “Feat earned:” line naming each new title, so none slips by unnoticed. After a victory the outcome card shows every item spent that battle, counted and named, so the player can weigh the cost of each encounter. After a victory the outcome card rates the performance from Flawless down to Victory by a thread based on how much of your health you lost, so you can gauge whether the fight was close or comfortable. When you are defeated the outcome card shows how close the enemy was to falling, using the same damage ratio you dealt, so you know how near the fight was to turning out differently. After you flee, the outcome card lists how many rounds you survived and any items you used before escaping, so you can see what the attempt cost.

Below the feats, the **Service record** tallies your real battles: battles won, bosses overcome, times carried home, safe withdrawals, wins after a defeat, and your current and longest winning runs. It also tracks cumulative lifetime totals: rounds fought, damage dealt, damage taken, Beacon Bursts fired, and items used in battle. These lifetime figures appear on the ending screen alongside your other journey stats. Sparring Drills and the Yard Gauntlet are practice and are not counted.

### The field bag

The bag screen holds the whole party's supplies and is reachable from town and the field. Member tabs choose whose stat line, gear comparisons and Equip buttons apply to; each stack lists its total sell value, and consumables can be used on the selected member without leaving the screen. Sort buttons above the item groups reorder stacks by type, name, or total sell value; the default order stays the way items were gathered. A search box above the groups narrows both the item groups and the craft table by name; search ignores letter case, and reopening the bag clears it. Each pack row has a Details button that opens a short sourcing note — where to buy or trade for the item, its Board Exchange price in marks, what it trades away, or why it never appears in shops — and choosing it again hides the note. Pack rows and shop buy and sell listings show a consumable's effect: how much HP or MP it restores and which status it cures. Selling a rare drop, or the last copy you own (packed or worn) of an item no shop stocks, needs a confirming second press on the same Sell button.

### Signal Line Patrol

After collecting the summit survey and Signal Calibration payments, Greyhaven's expedition board offers **Signal Line Patrol** for **120 gold**. Accept it, then win one new battle each against a Dust Marauder in Sunscar Relay, a Spire Sentry in Stormcrown Spire, and a Tempest Shade in The Storm’s Eye, in any order. The journal tracks each target separately; repeat victories against the same target cannot replace another, and earlier victories do not count.

Return to Greyhaven and explicitly claim the payment. This repeatable contract shares the board's one-active-patrol limit; cancelling or accepting it again starts all three counts over. It does not change the beacon ending or your relay choice.

### Planning with the Recipe Book

Use **All**, **Ready**, or **Missing** to narrow the Field Recipe Book, and type a recipe, ingredient, or output name before choosing **Search**. Search ignores letter case; **Clear search** keeps your availability filter. Filters use the last applied search, not unfinished typing. Reopening the book resets both choices. These controls only change the reference view: crafting still happens in the Bag or at a trader, and your journey save is unchanged.

### Supply Lines: choose a survey route

After explicitly reporting **Signal Calibration**, accept one optional **Supply Lines** route in Greyhaven. The route cannot be changed after acceptance; both pay **280 gold** on an explicit Greyhaven report. This is advance surveying for supply crews, not an escort with timers or convoy health.

- **Coastal:** use Patrol in Saltmere until you defeat a new **Wrack Eel**, then inspect the **Harbor Lamp (4,5)**.
- **Highland:** use Patrol in Highwatch until you defeat a new **Rime Wight**, then inspect the **Highwatch Cairn (4,1)**.
- **Either route:** next use Patrol in Sunscar Relay until you defeat a new **Dust Marauder**, then inspect the **Relay Capacitor Junction (3,1)**. Return to Greyhaven and explicitly report **Supply Lines**.

Steps must occur in that order after acceptance. Earlier victories, inspections, and unrelated foes do not count; repeating a completed step gives no extra credit. Save journey preserves the chosen route and completed steps. Talking alone never pays. Ordinary road threats, your original ending, and the relay’s chosen purpose remain unchanged.
