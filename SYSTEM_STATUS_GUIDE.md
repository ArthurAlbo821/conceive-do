# 📊 Guide de Vérification du Système

## ✅ Ce que vous avez accompli

Vous avez exécuté avec succès les deux scripts SQL requis :
1. ✅ Migration de la queue (`apply-migration-queue.sql`)
2. ✅ Configuration des cron jobs (depuis `SQL_EXECUTION_GUIDE.md`)

Le message "Success. No rows returned" est **NORMAL** et indique que tout s'est bien passé.

---

## 🔍 Vérification Visuelle du Système

Pour voir des résultats visuels confirmant que tout fonctionne, exécutez ce script dans le SQL Editor :

**Fichier** : `supabase/sql/verify-with-results.sql`

**Lien SQL Editor** : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

---

## 📋 Résultats Attendus (8 sections)

### Section 1 : Extensions
```
section     | pg_cron | pg_net
Extensions  | ✓       | ✓
```
**Signification** : Les extensions PostgreSQL requises sont activées.

---

### Section 2 : Table Queue
```
section      | status      | total_entries
Table Queue  | ✓ EXISTE    | 0
```
**Signification** : La table `evolution_instance_creation_queue` existe et est prête à recevoir des demandes.

**Note** : `total_entries = 0` est normal si aucun nouvel utilisateur n'a été créé depuis l'installation.

---

### Section 3 : Trigger et Fonction
```
section            | trigger_status | function_status
Trigger & Fonction | ✓ EXISTE       | ✓ EXISTE
```
**Signification** :
- ✅ Le trigger `on_profile_created_create_evolution_instance` est actif
- ✅ La fonction `handle_profile_evolution_instance()` est créée
- ✅ Quand un nouveau profil est créé, il sera automatiquement ajouté à la queue

---

### Section 4 : Cron Jobs ⭐ **TRÈS IMPORTANT**
```
section    | refresh_qr_codes              | process_queue
Cron Jobs  | ✓ ACTIF - */1 * * * *         | ✓ ACTIF - */5 * * * *
```
**Signification** :
- ✅ **refresh-qr-codes** : Actif, s'exécute **toutes les 1 minute**
- ✅ **process-evolution-queue** : Actif, s'exécute **toutes les 5 minutes**

**Si vous voyez "✗ MANQUANT"** :
→ Le cron job n'a pas été créé correctement
→ Revérifiez que vous avez bien remplacé `VOTRE_SERVICE_ROLE_KEY` dans le SQL

---

### Section 5 : QR Codes ⭐ **LE PLUS IMPORTANT**
```
section   | total_instances | instances_connecting | instances_connected | dernier_refresh         | statut_qr
QR Codes  | 3               | 1                    | 2                   | 2025-11-01 14:32:15+00  | ✓ < 2 min (PARFAIT)
```
**Signification** :
- **total_instances** : Nombre total d'instances Evolution API
- **instances_connecting** : Instances en attente de connexion (qui ont besoin de QR codes)
- **instances_connected** : Instances déjà connectées
- **dernier_refresh** : Date/heure du dernier rafraîchissement de QR code
- **statut_qr** : Indicateur le plus important !

**Statuts possibles** :
- ✅ **`✓ < 2 min (PARFAIT)`** : Le rafraîchissement automatique fonctionne !
- ✅ **`✓ < 5 min (OK)`** : Ça fonctionne, mais peut être amélioré
- ⚠️ **`⚠ 5-10 min (Un peu ancien)`** : Le cron job ne s'exécute peut-être pas
- ❌ **`✗ > 10 min (PROBLÈME!)`** : Le cron job ne fonctionne pas
- ⚠️ **`Aucun QR`** : Aucune instance en mode "connecting" actuellement

**Comment interpréter** :
- Si vous voyez `✓ < 2 min (PARFAIT)` → **Tout fonctionne parfaitement !**
- Attendez 2-3 minutes après avoir activé les cron jobs pour voir le premier rafraîchissement

---

### Section 6 : Queue de Création
```
section          | total | pending | processing | completed | failed | taux_succes
Queue Création   | 5     | 0       | 0          | 5         | 0      | 100.0
```
**Signification** :
- **total** : Nombre total de demandes de création d'instances
- **pending** : En attente de traitement
- **processing** : En cours de traitement
- **completed** : Traitées avec succès
- **failed** : Échecs
- **taux_succes** : Pourcentage de réussite

**Résultat idéal** :
- `pending = 0` (rien en attente trop longtemps)
- `taux_succes = 100%` ou proche de 100%

---

### Section 7 : Historique Cron (dernières 2 heures)
```
section           | executions_refresh_qr | executions_process_queue | derniere_exec_refresh
Historique Cron   | 45                    | 8                        | 2025-11-01 14:32:00+00
```
**Signification** :
- **executions_refresh_qr** : Nombre de fois que `refresh-qr-codes` a été exécuté
- **executions_process_queue** : Nombre de fois que `process-evolution-queue` a été exécuté
- **derniere_exec_refresh** : Dernière exécution du rafraîchissement

**Comment interpréter** :
- Si vous voyez `executions_refresh_qr > 0` → Le cron job fonctionne !
- Si `executions_refresh_qr = 0` après 5 minutes → Problème avec le cron job

---

### Section 8 : Score Global ⭐ **RÉSUMÉ FINAL**
```
╔═══════════════╗ | ║ STATUT FINAL ║                    | Score
RÉSUMÉ GLOBAL     | 🎉 TOUT FONCTIONNE PARFAITEMENT! 🎉 | 6/6
```

**Scores possibles** :
- **6/6** : 🎉 Tout fonctionne parfaitement
- **4-5/6** : ⚠️ Système partiellement fonctionnel (vérifier les sections précédentes)
- **< 4/6** : ✗ Système non fonctionnel (problèmes à corriger)

---

## 🎯 Checklist de Validation

Après avoir exécuté `verify-with-results.sql`, vérifiez :

- [ ] **Section 1** : Les 2 extensions affichent `✓`
- [ ] **Section 2** : La table queue affiche `✓ EXISTE`
- [ ] **Section 3** : Trigger et fonction affichent `✓ EXISTE`
- [ ] **Section 4** : Les 2 cron jobs affichent `✓ ACTIF`
- [ ] **Section 5** : Le statut_qr affiche `✓ < 2 min (PARFAIT)` (ou `✓ < 5 min (OK)`)
- [ ] **Section 6** : Le taux_succes est proche de 100%
- [ ] **Section 7** : `executions_refresh_qr > 0` (après quelques minutes)
- [ ] **Section 8** : Le score affiche `6/6`

---

## 🧪 Test de Fonctionnement

### Test 1 : Vérifier que les QR codes se rafraîchissent

1. Exécutez `verify-with-results.sql`
2. Notez l'heure dans `dernier_refresh` (Section 5)
3. Attendez 2 minutes
4. Ré-exécutez `verify-with-results.sql`
5. Vérifiez que `dernier_refresh` a changé

**Si dernier_refresh a changé** → ✅ Le rafraîchissement automatique fonctionne !

### Test 2 : Créer un nouvel utilisateur

1. Créez un nouveau compte utilisateur via votre application
2. Exécutez cette requête SQL :
```sql
SELECT * FROM evolution_instance_creation_queue
ORDER BY created_at DESC
LIMIT 1;
```
3. Vous devriez voir une nouvelle entrée avec `status = 'pending'`
4. Attendez 5-10 minutes
5. Ré-exécutez la requête
6. Le status devrait être `'completed'`
7. Vérifiez que l'instance a été créée :
```sql
SELECT * FROM evolution_instances
ORDER BY created_at DESC
LIMIT 1;
```

**Si vous voyez l'instance créée** → ✅ La création automatique fonctionne !

---

## 🐛 Dépannage

### Problème : Score < 6/6

**Retournez aux sections 1-4** pour voir ce qui manque :
- Extensions manquantes → Activez-les dans Dashboard > Database > Extensions
- Table queue manquante → Ré-exécutez `apply-migration-queue.sql`
- Trigger/fonction manquants → Ré-exécutez `apply-migration-queue.sql`
- Cron jobs manquants → Ré-exécutez le SQL des cron jobs avec votre SERVICE_ROLE_KEY

### Problème : statut_qr = "✗ > 10 min (PROBLÈME!)"

**Causes possibles** :
1. Le cron job ne s'exécute pas
   - Vérifiez Section 4 : Les cron jobs doivent afficher `✓ ACTIF`
   - Vérifiez Section 7 : `executions_refresh_qr` devrait être > 0

2. La SERVICE_ROLE_KEY est incorrecte
   - Revérifiez votre clé dans : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/api
   - Ré-exécutez le SQL des cron jobs avec la bonne clé

3. L'Edge Function a un problème
   - Consultez les logs : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/logs/edge-functions
   - Cherchez des erreurs dans `refresh-qr-codes`

### Problème : statut_qr = "Aucun QR"

**C'est normal si** :
- Vous n'avez aucune instance en statut "connecting"
- Toutes vos instances sont déjà "connected"

**Pour tester** :
- Déconnectez une instance Evolution API
- Son statut passera à "connecting"
- Le QR code devrait apparaître dans les 60 secondes

---

## 📊 Commandes SQL Utiles

### Voir l'historique détaillé des cron jobs
```sql
SELECT
  job.jobname,
  details.start_time,
  details.end_time,
  details.status,
  details.return_message,
  (details.end_time - details.start_time) AS duration
FROM cron.job_run_details details
JOIN cron.job job ON details.jobid = job.jobid
WHERE job.jobname IN ('refresh-qr-codes', 'process-evolution-queue')
ORDER BY details.start_time DESC
LIMIT 20;
```

### Voir les QR codes récemment rafraîchis
```sql
SELECT
  instance_name,
  instance_status,
  last_qr_update,
  NOW() - last_qr_update AS age,
  qr_code IS NOT NULL AS has_qr,
  LENGTH(qr_code) AS qr_size
FROM evolution_instances
WHERE instance_status = 'connecting'
ORDER BY last_qr_update DESC;
```

### Voir la queue de création
```sql
SELECT
  id,
  user_id,
  status,
  error_message,
  retry_count,
  created_at,
  processed_at,
  (processed_at - created_at) AS processing_time
FROM evolution_instance_creation_queue
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🎉 Confirmation Finale

Si vous obtenez ces résultats après avoir exécuté `verify-with-results.sql` :

- ✅ Score : **6/6**
- ✅ Statut QR : **✓ < 2 min (PARFAIT)**
- ✅ Cron jobs : **✓ ACTIF**
- ✅ Exécutions : **> 0**

**→ FÉLICITATIONS ! Votre système fonctionne parfaitement ! 🎊**

### Ce qui fonctionne maintenant :

1. **Création automatique d'instances** :
   - Quand un utilisateur s'inscrit → Entrée dans la queue
   - Toutes les 5 minutes → Queue traitée
   - Instance créée avec webhooks configurés automatiquement

2. **Rafraîchissement automatique des QR codes** :
   - Toutes les 60 secondes → QR codes mis à jour
   - Pas besoin de recharger la page
   - Les utilisateurs voient toujours le bon QR code

3. **Système résilient** :
   - Retry automatique en cas d'échec
   - Logs détaillés pour debugging
   - Monitoring en temps réel

---

## 📚 Documentation Complète

- **Setup complet** : [QR_REFRESH_SETUP.md](QR_REFRESH_SETUP.md)
- **Guide rapide** : [QUICK_START_QR_REFRESH.md](QUICK_START_QR_REFRESH.md)
- **Changements détaillés** : [QR_REFRESH_CHANGES.md](QR_REFRESH_CHANGES.md)
- **Instructions finales** : [FINAL_SETUP_INSTRUCTIONS.md](FINAL_SETUP_INSTRUCTIONS.md)
- **Guide SQL** : [SQL_EXECUTION_GUIDE.md](SQL_EXECUTION_GUIDE.md)

---

**Date** : 2025-11-01
**Projet** : conceive-do
**Statut** : ✅ Système déployé et opérationnel
