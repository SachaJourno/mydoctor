# MyDoctor

Le médecin saisit ses instructions (notes, dictée, photo ou PDF d'ordonnance). L'IA en tire un plan structuré, **le médecin le relit et le valide**, puis le patient le reçoit avec ses rappels de prise, ses tâches à cocher (pharmacie, rendez-vous, examens) et un chat qui lui explique son traitement.

> L'assistant explique le plan validé par le médecin. Il ne remplace pas un avis médical.

## Ce qui est en place

| Partie | Contenu |
| --- | --- |
| App (iOS, Android, web) | Expo + Expo Router, un seul code pour le médecin et le patient (`src/app`) |
| Médecin | Invitation d'un patient par code à 6 chiffres, consultation avec notes, photo ou PDF, analyse par l'IA, relecture des champs incertains, envoi au patient |
| Patient | Écran « Aujourd'hui » : prises à cocher, médicaments « si besoin », tâches, conseils ; rappels locaux sur le téléphone ; chat |
| Base de données | `supabase/migrations` : tables, règles d'accès (RLS), stockage privé des ordonnances |
| IA | `supabase/functions/extract-plan` (lecture de l'ordonnance) et `supabase/functions/patient-chat` (chat encadré), avec Claude |

La saisie vocale passe pour l'instant par le micro du clavier du téléphone. Une transcription dédiée est prévue à l'étape 6 du plan.

## Installation

1. Créez un projet sur [supabase.com](https://supabase.com) (région Europe).
2. Installez la CLI Supabase, puis liez le projet et appliquez le schéma :
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-du-projet>
   npx supabase db push
   ```
3. Donnez la clé Claude aux fonctions et déployez-les :
   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy extract-plan
   npx supabase functions deploy patient-chat
   ```
4. Copiez `.env.example` en `.env` et renseignez l'URL et la clé `anon` du projet.
5. Lancez l'app :
   ```bash
   npm install
   npx expo start        # puis « w » pour le web, ou scannez le QR code avec Expo Go
   ```

Les rappels de prise ne fonctionnent que sur téléphone (pas sur le web).

## Vérifications

```bash
npm run typecheck   # TypeScript de l'app
npm test            # calcul des prises et des rappels
npm run test:db     # schéma et règles d'accès sur un Postgres local
```

## Données de santé

Ce MVP est prévu pour des **données fictives**. Avant de vrais patients : hébergement certifié HDS (Supabase Cloud ne l'est pas), analyse d'impact RGPD, contrat de traitement avec le fournisseur d'IA, et qualification éventuelle en dispositif médical. Le détail est dans le document d'architecture du projet.
