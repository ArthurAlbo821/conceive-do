# 🔍 Guide de Vérification du Système

## Script de Vérification Automatique

Après avoir exécuté les 2 scripts SQL (migration + cron jobs), utilisez ce script pour vérifier que tout fonctionne.

---

## 🚀 Comment Vérifier

### Étape 1 : Ouvrir le SQL Editor

Allez sur : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

### Étape 2 : Copier le Script de Vérification

```bash
cat supabase/sql/verify-all-systems.sql
```

### Étape 3 : Coller et Exécuter

Collez tout le contenu dans le SQL Editor et cliquez sur **RUN** (ou Ctrl+Enter)

---

## 📊 Ce que Vous Allez Voir

Le script vérifie **8 sections** :

### 1️⃣ Extensions Requises
- ✓ pg_cron activée
- ✓ pg_net activée

### 2️⃣ Table de Queue
- ✓ Table `evolution_instance_creation_queue` existe

### 3️⃣ Trigger et Fonction
- ✓ Trigger `on_profile_created_create_evolution_instance` existe et actif
- ✓ Fonction `handle_profile_evolution_instance` existe

### 4️⃣ Cron Jobs
- ✓ `refresh-qr-codes` : actif, toutes les 1 minute
- ✓ `process-evolution-queue` : actif, toutes les 5 minutes

### 5️⃣ Historique des Exécutions
- Nombre d'exécutions dans les dernières 2 heures
- Dernière exécution de chaque job

### 6️⃣ État des QR Codes
- Nombre d'instances totales
- Instances connectées vs en attente
- **Âge du dernier QR rafraîchi** (le plus important !)

### 7️⃣ État de la Queue
- Nombre total de demandes
- En attente, en traitement, complétées, échouées
- Taux de succès

### 8️⃣ Résumé Global
- **Score de santé** (X/6)
- Statut final : ✅ ou ⚠️ ou ✗

---

## ✅ Résultat Attendu (Si Tout Fonctionne)

```
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║                  🎉 TOUT FONCTIONNE PARFAITEMENT! 🎉              ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

Votre système est entièrement opérationnel:
  ✓ QR codes rafraîchis automatiquement toutes les 60 secondes
  ✓ Instances créées automatiquement lors de l'inscription
  ✓ Queue traitée toutes les 5 minutes
  ✓ Webhooks configurés automatiquement

Score de santé: 6/6
```

---

## 🔍 Indicateurs Clés à Surveiller

### ⭐ Le Plus Important : Âge du QR Code

Dans la section **6️⃣ État des QR Codes**, regardez :

```
Dernier rafraîchissement QR: il y a X minute(s)
```

- **< 2 minutes** → ✅ PARFAIT ! Le rafraîchissement automatique fonctionne
- **2-5 minutes** → ✅ OK, juste un peu de délai
- **5-10 minutes** → ⚠️ Le cron job est peut-être lent
- **> 10 minutes** → ✗ PROBLÈME ! Le cron job ne fonctionne pas

### ⭐ Cron Jobs Actifs

Dans la section **4️⃣ Cron Jobs**, vérifiez :

```
✓ Cron job refresh-qr-codes : EXISTE
  ✓ Statut: ACTIF
  ✓ Schedule: */1 * * * * (toutes les 1 minute)
```

Si vous voyez **✗ MANQUANT** ou **✗ INACTIF** → Réexécutez le script de configuration des cron jobs

---

## 🐛 Si Quelque Chose Ne Fonctionne Pas

### Problème : Extensions Manquantes

```
✗ pg_cron : NON ACTIVÉE (CRITIQUE)
```

**Solution** : Exécutez dans le SQL Editor :
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

---

### Problème : Table/Trigger Manquant

```
✗ Table evolution_instance_creation_queue : MANQUANTE
```

**Solution** : Réexécutez le fichier `supabase/sql/apply-migration-queue.sql`

---

### Problème : Cron Jobs Manquants

```
✗ Cron job refresh-qr-codes : MANQUANT (CRITIQUE)
```

**Solution** : Réexécutez le script de configuration des cron jobs (voir SQL_EXECUTION_GUIDE.md)

**N'oubliez pas de remplacer `VOTRE_SERVICE_ROLE_KEY` !**

---

### Problème : QR Codes Pas Rafraîchis

```
✗ QR codes PÉRIMÉS (> 10 min) - Le cron job ne fonctionne pas!
```

**Vérifications** :

1. **Le cron job est-il actif ?**
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'refresh-qr-codes';
   ```
   → Doit montrer `active = true`

2. **Y a-t-il des exécutions récentes ?**
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-qr-codes')
   ORDER BY start_time DESC LIMIT 5;
   ```
   → Doit montrer des exécutions toutes les 1 minute

3. **La clé service role est-elle correcte ?**
   - Vérifiez que vous avez bien remplacé `VOTRE_SERVICE_ROLE_KEY`
   - La clé doit commencer par `eyJ...`

---

## 📊 Vérifications Manuelles Complémentaires

### Voir les Dernières Exécutions du Cron

```sql
SELECT
  job.jobname,
  details.start_time,
  details.end_time,
  details.status,
  (details.end_time - details.start_time) as duration
FROM cron.job_run_details details
JOIN cron.job job ON details.jobid = job.jobid
WHERE job.jobname IN ('refresh-qr-codes', 'process-evolution-queue')
ORDER BY details.start_time DESC
LIMIT 10;
```

### Voir les Instances et Leurs QR Codes

```sql
SELECT
  instance_name,
  instance_status,
  last_qr_update,
  NOW() - last_qr_update AS age,
  qr_code IS NOT NULL AS has_qr
FROM evolution_instances
ORDER BY last_qr_update DESC NULLS LAST;
```

### Voir la Queue de Création

```sql
SELECT
  user_id,
  status,
  retry_count,
  error_message,
  created_at,
  processed_at
FROM evolution_instance_creation_queue
ORDER BY created_at DESC;
```

---

## ✅ Checklist Finale

Après avoir exécuté le script de vérification, cochez :

- [ ] Extensions pg_cron et pg_net activées
- [ ] Table evolution_instance_creation_queue existe
- [ ] Trigger actif
- [ ] Cron job refresh-qr-codes actif (*/1 * * * *)
- [ ] Cron job process-evolution-queue actif (*/5 * * * *)
- [ ] **QR code rafraîchi récemment (< 2 minutes)** ⭐
- [ ] Score de santé : 6/6
- [ ] Message final : 🎉 TOUT FONCTIONNE PARFAITEMENT!

---

## 🎯 Résumé

| Indicateur | OK | Problème |
|------------|-----|----------|
| **Extensions** | ✓ pg_cron + pg_net | ✗ Manquantes |
| **Table queue** | ✓ Existe | ✗ Manquante |
| **Trigger** | ✓ Actif | ✗ Désactivé/Manquant |
| **Cron jobs** | ✓ 2 jobs actifs | ✗ Manquants/Inactifs |
| **QR refresh** | ✓ < 2 min | ✗ > 10 min |
| **Score** | 6/6 | < 6 |

---

## 📚 Documentation Complémentaire

- **Guide SQL complet** : [SQL_EXECUTION_GUIDE.md](SQL_EXECUTION_GUIDE.md)
- **Instructions finales** : [FINAL_SETUP_INSTRUCTIONS.md](FINAL_SETUP_INSTRUCTIONS.md)
- **Guide QR refresh** : [QR_REFRESH_SETUP.md](QR_REFRESH_SETUP.md)

---

**Temps de vérification** : ~30 secondes
**Fréquence recommandée** : Après chaque modification, puis une fois par semaine
