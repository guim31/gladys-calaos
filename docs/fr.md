# Calaos

Amène dans Gladys les pièces et les IO de votre serveur domotique [Calaos](https://calaos.fr) :
lumières, variateurs, lumières de couleur, volets, capteurs, interrupteurs muraux, variables
internes et scénarios. Gladys parle à `calaos_server` sur votre réseau local, par l'API JSON
qu'utilisent les applications Calaos, et reçoit chaque changement en direct.

Testée contre un vrai `calaos_server` 4.8.3, avec des IO simulées, pas sur une installation avec
du vrai matériel Wago, KNX ou 1-Wire : vos retours sont les bienvenus sur le forum.

## Prérequis

- Un serveur Calaos (Calaos OS, ou le conteneur `calaos_base`) joignable depuis la machine de
  Gladys.
- Le nom d'utilisateur et le mot de passe des applications Calaos (Calaos Home, l'application
  web).
- Gladys 5.1 ou plus récent.

## Configuration

### Adresse

L'adresse IP du serveur Calaos, vue depuis Gladys : `192.168.1.20`. Le port 5454 est ajouté si
vous n'en donnez pas ; sinon, indiquez `192.168.1.20:5454` ou `http://192.168.1.20:5454`. Utilisez
le port de `calaos_server` lui-même, pas le port HTTPS de l'application web : Gladys n'accepte pas
le certificat autosigné d'une box Calaos.

### Nom d'utilisateur et mot de passe

Ceux des applications Calaos. Après un mauvais mot de passe, Calaos ralentit un moment chaque
nouvel essai venant de la même adresse (jusqu'à une minute) : Gladys réessaie quelques secondes
plus tard, puis chaque minute.

### Choisir ce qui est importé

Chaque IO de chaque pièce est proposée dans l'onglet **Découverte** de l'intégration : ajoutez
celles que vous voulez. **Seulement les IO de ces pièces** garde les pièces que vous listez (noms
de pièces Calaos, séparés par des virgules).

Les IO masquées dans les applications Calaos (variables internes, sorties techniques) ne sont
proposées qu'avec **Proposer aussi les IO masquées**. Les interrupteurs et boutons muraux sont
toujours proposés, car Calaos les masque par défaut.

### Langue

**Langue des noms de fonctionnalités** choisit la langue des noms que Gladys donne aux
fonctionnalités (Marche/arrêt, Luminosité…), à l'ajout de l'appareil.

## Ce que vous obtenez

### Appareils

Un appareil Gladys par IO Calaos, nommé d'après l'IO et sa pièce :

| IO Calaos                              | Dans Gladys                                                           |
| -------------------------------------- | --------------------------------------------------------------------- |
| Lumière                                | lumière, marche/arrêt                                                 |
| Variateur                              | lumière, marche/arrêt et luminosité                                   |
| Lumière de couleur (RGB)               | lumière, marche/arrêt et couleur                                      |
| Volet                                  | volet, ouvrir / stop / fermer                                         |
| Volet intelligent                      | volet, ouvrir / stop / fermer et position (100 % = ouvert)            |
| Température                            | capteur de température (°C)                                           |
| Entrée analogique                      | le capteur de son style ou de son unité : humidité, pression, lux, W… |
| Interrupteur, porte, mouvement, fumée… | entrée, ou le détecteur de son style (ouverture, mouvement, fuite…)   |
| Interrupteurs appui long et triple     | bouton : clic, clic long, double et triple clic                       |
| Booléen interne                        | commutateur                                                           |
| Texte interne, entrée texte            | texte                                                                 |
| Scénario                               | bouton poussoir qui le lance                                          |

Non importés : sorties analogiques, nombres internes, plages horaires, minuteries, caméras,
lecteurs audio et amplis. **Tester la connexion** liste ce qui a été laissé de côté. Une entrée
analogique dont Gladys ne connaît pas l'unité (ou un pourcentage sans le style humidité) est aussi
laissée de côté : choisissez son style dans Calaos Installer.

Les états arrivent en direct, quelques centièmes de seconde après le changement. Les mesures sont
envoyées au plus toutes les 10 secondes, la position d'un volet intelligent en mouvement toutes les
2 secondes.

### Widget du tableau de bord

**Calaos** : la connexion, la version de Calaos, mises à jour en direct ou par interrogation, les
IO proposées et ajoutées, et un bouton pour relire la liste des IO (masquable dans les réglages du
widget).

### Déclencheur de scène

**IO Calaos modifiée** : une IO a changé dans Calaos, même non ajoutée à Gladys (un bouton, un
scénario, une variable interne). Filtrez sur le nom de l'IO et la nouvelle valeur ; les variables
donnent l'identifiant, le nom, la pièce, la nouvelle et l'ancienne valeur. Les températures et les
entrées analogiques ne le déclenchent pas (utilisez leur appareil), ni les positions
intermédiaires d'un volet intelligent en mouvement.

### Actions de scène

- **Lancer un scénario Calaos**, par son nom, même non ajouté à Gladys.
- **Envoyer une valeur à une IO Calaos**, comme le font les règles Calaos : `true`, `false`,
  `toggle`, `set 50`, `up`, `down`, `stop`, `impulse 500`, `set #FF8000`… L'IO est son nom, ou son
  identifiant quand deux IO portent le même nom (le message d'erreur donne les identifiants).

## Exemples de scènes

- Quand le bouton « Porte d'entrée » reçoit un appui long, lancer le scénario Calaos « Départ ».
- Quand Gladys ne détecte plus personne à la maison, envoyer `true` à la variable interne « Mode
  absence » qu'utilisent vos règles Calaos.
- Quand l'IO Calaos « Sonnette » passe à `true`, envoyer un message Telegram.

## Dépannage

- **Calaos ne répond pas** : vérifiez l'adresse et le port (5454) depuis la machine de Gladys, et
  que `calaos_server` tourne.
- **Connexion refusée** : vérifiez le nom d'utilisateur et le mot de passe dans les applications
  Calaos. Après plusieurs échecs, attendez une minute.
- **Mises à jour : toutes les 30 s** dans le widget : la WebSocket de Calaos est refusée (un proxy
  intermédiaire qui ne la laisse pas passer). Gladys lit les états en HTTP toutes les 30 secondes
  et réessaie la WebSocket régulièrement.
- **Une IO manque** : elle est masquée dans Calaos (voir l'option), hors des pièces choisies, ou
  d'un type non importé (**Tester la connexion** les liste).

## Limites

- Ni thermostat, ni lecteur audio, ni caméra, ni ampli.
- Un interrupteur de porte ou de fenêtre est lu comme ouvert quand Calaos dit `true`.
- Un volet simple n'a pas de position : son état passe à fermé à la fin de son temps de course.
- Les commandes passent par `set_state` : Calaos les accepte ou les refuse, sans dire pourquoi.

## Confidentialité

Tout reste sur votre réseau local : Gladys ne parle qu'à votre serveur Calaos. Le mot de passe est
gardé par Gladys, jamais écrit dans les journaux.
