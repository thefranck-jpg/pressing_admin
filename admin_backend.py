from fastapi import FastAPI, APIRouter, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel
import os
import uvicorn

# ── IMPORTS DES MODULES DU BACKEND ───────────────────────────
from database import get_db
from security import require_admin, get_current_user, verify_password, create_admin_token
from models import (User, Commande, OrderItem, Collecte, DemandeDepot,
                    Facture, TransactionWallet, Referral, Notification,
                    NegoConversation, NegoMessage, TarifService, Offre,
                    ConfigParrainage, Wallet, StatutHistorique, AuditLog)

# ════════════════════════════════════════════════════════════════
# 1. CRÉATION DE L'APPLICATION FASTAPI
# ════════════════════════════════════════════════════════════════
app = FastAPI(title="Nymphe Admin Dashboard")

# ════════════════════════════════════════════════════════════════
# 2. CORS (PERMET AU DASHBOARD DE COMMUNIQUER AVEC LE BACKEND)
# ════════════════════════════════════════════════════════════════
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nymphe-production.up.railway.app",
        "http://localhost:3000",
        "http://localhost:5000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ════════════════════════════════════════════════════════════════
# 3. SERVIR LES FICHIERS STATIQUES (HTML, CSS, JS)
# ════════════════════════════════════════════════════════════════
app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")
app.mount("/images", StaticFiles(directory="images"), name="images")

# ════════════════════════════════════════════════════════════════
# 4. ROUTES POUR L'INTERFACE HTML
# ════════════════════════════════════════════════════════════════
@app.get("/")
async def index():
    return FileResponse("index.html")

@app.get("/dashboard")
async def dashboard_page():
    return FileResponse("dashboard.html")

# ════════════════════════════════════════════════════════════════
# 5. ROUTER ADMIN (TOUTES TES ROUTES API)
# ════════════════════════════════════════════════════════════════
router = APIRouter(prefix="/admin", tags=["Admin"])

# ── SCHEMAS ───────────────────────────────────────────────────
class TarifUpdate(BaseModel):
    name: str
    price: float
    description: Optional[str] = None

class OffreCreate(BaseModel):
    title: str
    description: Optional[str] = None
    discount: float
    start_date: str
    end_date: str

class NotifBroadcast(BaseModel):
    titre: str
    message: str

class CommandeStatutBody(BaseModel):
    status: str
    note_admin: Optional[str] = None

class CollecteStatutBody(BaseModel):
    status: str
    livreur_id: Optional[int] = None

class OffreAdminCreate(BaseModel):
    montant_offre: float
    content: Optional[str] = "Voici une proposition de réduction."

class LoginRequest(BaseModel):
    email: str
    password: str

# ─────────────────────────────────────────────────────────────
# 0. AUTHENTIFICATION ADMIN
# ─────────────────────────────────────────────────────────────
@router.post("/login")
def admin_login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    token = create_admin_token(user.id)

    return {
        "token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    }

# ─────────────────────────────────────────────────────────────
# 1. DASHBOARD STATS
# ─────────────────────────────────────────────────────────────
@router.get("/dashboard")
def dashboard(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    today = date.today()

    # Stats générales
    total_clients    = db.query(User).filter(User.role == "client").count()
    total_commandes  = db.query(Commande).count()
    cmd_en_cours     = db.query(Commande).filter(Commande.status.in_(["reçue", "en_traitement", "en_lavage", "en_repassage"])).count()
    collectes_today  = db.query(Collecte).filter(func.date(Collecte.scheduled_at) == today).count()
    depots_attente   = db.query(DemandeDepot).filter(DemandeDepot.status == "en_attente").count()
    msg_non_lus      = db.query(NegoConversation).filter(NegoConversation.admin_unread > 0).count()

    # CA du mois
    ca_mois = float(db.query(func.sum(Facture.total)).filter(
        Facture.status == "soldée",
        func.extract("month", Facture.payee_le) == today.month,
        func.extract("year", Facture.payee_le) == today.year,
    ).scalar() or 0)

    # CA du jour
    ca_jour = float(db.query(func.sum(Facture.total)).filter(
        Facture.status == "soldée",
        func.date(Facture.payee_le) == today,
    ).scalar() or 0)

    # Dépôts validés ce mois
    depots_mois = float(db.query(func.sum(TransactionWallet.amount)).filter(
        TransactionWallet.type == "depot",
        func.extract("month", TransactionWallet.created_at) == today.month,
    ).scalar() or 0)

    # Évolution 7 derniers jours
    evolution = []
    from datetime import timedelta
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        ca = float(db.query(func.sum(Facture.total)).filter(
            Facture.status == "soldée", func.date(Facture.payee_le) == d
        ).scalar() or 0)
        nb = db.query(Commande).filter(func.date(Commande.created_at) == d).count()
        evolution.append({"date": str(d), "ca": ca, "commandes": nb})

    # Dernières commandes
    dernieres = db.query(Commande).order_by(desc(Commande.created_at)).limit(8).all()
    dernieres_data = []
    for c in dernieres:
        u = db.query(User).filter(User.id == c.user_id).first()
        dernieres_data.append({
            "id": c.id, "status": c.status,
            "client": u.name if u else "?",
            "montant": float(sum(float(i.price or 0) * (i.quantity or 1) for i in c.items)),
            "created_at": str(c.created_at),
        })

    # Dernières demandes dépôt
    derniers_depots = db.query(DemandeDepot).filter(
        DemandeDepot.status == "en_attente"
    ).order_by(desc(DemandeDepot.created_at)).limit(5).all()
    depots_data = []
    for d in derniers_depots:
        u = db.query(User).filter(User.id == d.user_id).first()
        depots_data.append({
            "id": d.id, "montant": float(d.montant),
            "operateur": d.operateur, "numero": d.numero_transaction,
            "client": u.name if u else "?",
            "created_at": str(d.created_at),
        })

    return {
        "stats": {
            "total_clients": total_clients,
            "total_commandes": total_commandes,
            "commandes_en_cours": cmd_en_cours,
            "collectes_aujourd_hui": collectes_today,
            "depots_en_attente": depots_attente,
            "messages_non_lus": msg_non_lus,
            "ca_mois_fcfa": ca_mois,
            "ca_jour_fcfa": ca_jour,
            "depots_mois_fcfa": depots_mois,
        },
        "evolution_7j": evolution,
        "dernieres_commandes": dernieres_data,
        "depots_en_attente": depots_data,
    }

# ─────────────────────────────────────────────────────────────
# 2. GESTION UTILISATEURS
# ─────────────────────────────────────────────────────────────
@router.get("/users")
def liste_users(
    role: Optional[str] = None,
    search: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if search:
        q = q.filter(
            (User.name.ilike(f"%{search}%")) |
            (User.email.ilike(f"%{search}%"))
        )
    users = q.order_by(desc(User.created_at)).all()
    result = []
    for u in users:
        wallet = db.query(Wallet).filter(Wallet.user_id == u.id).first()
        nb_cmd = db.query(Commande).filter(Commande.user_id == u.id).count()
        result.append({
            "id": u.id, "name": u.name, "email": u.email,
            "phone": u.phone, "role": u.role,
            "referral_code": u.referral_code,
            "solde": float(wallet.balance if wallet else 0),
            "nb_commandes": nb_cmd,
            "onboarding_done": u.onboarding_done,
            "created_at": str(u.created_at),
        })
    return result

@router.get("/users/{user_id}")
def detail_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "Introuvable")
    wallet = db.query(Wallet).filter(Wallet.user_id == u.id).first()
    commandes = db.query(Commande).filter(Commande.user_id == u.id).all()
    collectes = db.query(Collecte).filter(Collecte.user_id == u.id).all()
    transactions = db.query(TransactionWallet).filter(
        TransactionWallet.wallet_id == (wallet.id if wallet else -1)
    ).order_by(desc(TransactionWallet.created_at)).limit(10).all()
    return {
        "id": u.id, "name": u.name, "email": u.email,
        "phone": u.phone, "role": u.role,
        "address": u.address, "referral_code": u.referral_code,
        "solde": float(wallet.balance if wallet else 0),
        "created_at": str(u.created_at),
        "nb_commandes": len(commandes),
        "nb_collectes": len(collectes),
        "transactions_recentes": [
            {"type": t.type, "amount": float(t.amount), "note": t.note, "date": str(t.created_at)}
            for t in transactions
        ],
    }

@router.put("/users/{user_id}/role")
def changer_role(user_id: int, role: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if role not in ("client", "admin", "livreur"):
        raise HTTPException(400, "Rôle invalide")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "Introuvable")
    u.role = role
    db.commit()
    _log(db, admin.id, f"Rôle de {u.name} (#{u.id}) changé → {role}")
    return {"message": f"Rôle → {role}"}

@router.delete("/users/{user_id}")
def supprimer_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "Introuvable")
    _log(db, admin.id, f"Utilisateur supprimé : {u.name} (#{u.id})")
    db.delete(u)
    db.commit()
    return {"message": "Utilisateur supprimé"}

@router.post("/users/{user_id}/crediter")
def crediter_wallet(
    user_id: int,
    montant: float,
    note: str = "Crédit admin",
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        wallet = Wallet(user_id=user_id, balance=0)
        db.add(wallet)
        db.flush()
    wallet.balance = (wallet.balance or Decimal("0")) + Decimal(str(montant))
    tx = TransactionWallet(wallet_id=wallet.id, type="credit_admin", amount=Decimal(str(montant)), note=note)
    db.add(tx)
    db.commit()
    _log(db, admin.id, f"Crédit wallet {montant} FCFA → user #{user_id}")
    return {"message": f"{montant} FCFA crédités", "nouveau_solde": float(wallet.balance)}

# ─────────────────────────────────────────────────────────────
# 3. GESTION COMMANDES
# ─────────────────────────────────────────────────────────────
@router.get("/commandes")
def toutes_commandes(
    status: Optional[str] = None,
    search: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    q = db.query(Commande)
    if status:
        q = q.filter(Commande.status == status)
    commandes = q.order_by(desc(Commande.created_at)).all()
    result = []
    for c in commandes:
        u = db.query(User).filter(User.id == c.user_id).first()
        total = sum(float(i.price or 0) * (i.quantity or 1) for i in c.items)
        if search and u and search.lower() not in (u.name or "").lower():
            continue
        result.append({
            "id": c.id, "status": c.status,
            "type_livraison": c.type_livraison,
            "client_name": u.name if u else "?",
            "client_email": u.email if u else "?",
            "nb_articles": len(c.items),
            "total": total,
            "note_admin": c.note_admin,
            "created_at": str(c.created_at),
            "facture": {"id": c.facture.id, "status": c.facture.status, "total": float(c.facture.total)} if c.facture else None,
        })
    return result

@router.get("/commandes/{cmd_id}")
def detail_commande(cmd_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.query(Commande).filter(Commande.id == cmd_id).first()
    if not c:
        raise HTTPException(404, "Introuvable")
    u = db.query(User).filter(User.id == c.user_id).first()
    historique = db.query(StatutHistorique).filter(StatutHistorique.commande_id == c.id).all()
    return {
        "id": c.id, "status": c.status,
        "type_livraison": c.type_livraison,
        "note_client": c.note_client, "note_admin": c.note_admin,
        "created_at": str(c.created_at),
        "client": {"id": u.id, "name": u.name, "email": u.email, "phone": u.phone} if u else None,
        "items": [{"id": i.id, "designation": i.designation, "quantity": i.quantity,
                   "price": float(i.price or 0), "status": i.status,
                   "photo_avant": i.photo_avant, "photo_apres": i.photo_apres} for i in c.items],
        "facture": {"id": c.facture.id, "total": float(c.facture.total),
                    "remise": float(c.facture.remise or 0), "remise_nego": float(c.facture.remise_nego or 0),
                    "status": c.facture.status, "mode_paiement": c.facture.mode_paiement} if c.facture else None,
        "historique": [{"old": h.old_status, "new": h.new_status, "date": str(h.changed_at)} for h in historique],
    }

@router.put("/commandes/{cmd_id}/status")
def update_cmd_status(
    cmd_id: int,
    payload: CommandeStatutBody,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    c = db.query(Commande).filter(Commande.id == cmd_id).first()
    if not c:
        raise HTTPException(404, "Introuvable")
    old = c.status
    c.status = payload.status
    if payload.note_admin:
        c.note_admin = payload.note_admin
    hist = StatutHistorique(commande_id=c.id, old_status=old, new_status=payload.status)
    db.add(hist)

    # Notif client
    msgs = {
        "en_traitement": ("🧺 En traitement", f"Votre commande #{c.id} est prise en charge."),
        "en_lavage":     ("🫧 En lavage",     f"Votre commande #{c.id} est en cours de lavage."),
        "en_repassage":  ("👕 En repassage",  f"Votre commande #{c.id} est en cours de repassage."),
        "prête":         ("✅ Prête !",       f"Votre commande #{c.id} est prête."),
        "livrée":        ("🎉 Livrée !",      f"Votre commande #{c.id} a été livrée."),
        "annulée":       ("❌ Annulée",       f"Votre commande #{c.id} a été annulée."),
    }
    if payload.status in msgs:
        t, m = msgs[payload.status]
        db.add(Notification(user_id=c.user_id, title=t, message=m, type="commande",
                           entity_id=c.id, route="/orders"))
    db.commit()
    _log(db, admin.id, f"Commande #{c.id} : {old} → {payload.status}")
    return {"message": f"Statut → {payload.status}"}

@router.put("/commandes/{cmd_id}/articles/{item_id}/status")
def update_article_status(
    cmd_id: int, item_id: int, status: str,
    admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    item = db.query(OrderItem).filter(OrderItem.id == item_id, OrderItem.commande_id == cmd_id).first()
    if not item:
        raise HTTPException(404, "Article introuvable")
    item.status = status
    db.commit()
    return {"message": f"Article → {status}"}

@router.post("/commandes/{cmd_id}/facture")
def generer_facture(cmd_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.query(Commande).filter(Commande.id == cmd_id).first()
    if not c:
        raise HTTPException(404, "Introuvable")
    if c.facture:
        raise HTTPException(400, "Facture déjà générée")
    total = sum(float(i.price or 0) * (i.quantity or 1) for i in c.items)
    f = Facture(commande_id=c.id, total=total, remise=0, remise_nego=0, status="en_attente")
    db.add(f)
    db.commit()
    db.refresh(f)
    db.add(Notification(user_id=c.user_id, title="🧾 Facture disponible",
                        message=f"Facture pour commande #{c.id} : {total} FCFA", type="wallet",
                        entity_id=f.id, route="/wallet"))
    db.commit()
    _log(db, admin.id, f"Facture générée pour commande #{c.id} — {total} FCFA")
    return {"message": "Facture générée", "facture_id": f.id, "total": total}

# ─────────────────────────────────────────────────────────────
# 4. GESTION COLLECTES
# ─────────────────────────────────────────────────────────────
@router.get("/collectes")
def toutes_collectes(
    status: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    q = db.query(Collecte)
    if status:
        q = q.filter(Collecte.status == status)
    collectes = q.order_by(Collecte.scheduled_at.asc()).all()
    result = []
    for col in collectes:
        u = db.query(User).filter(User.id == col.user_id).first()
        result.append({
            "id": col.id, "status": col.status,
            "adresse": col.adresse, "quartier": col.quartier,
            "latitude": col.latitude, "longitude": col.longitude,
            "creneau": col.creneau,
            "scheduled_at": str(col.scheduled_at),
            "note_client": col.note_client,
            "articles_prevus": col.articles_prevus,
            "livreur_id": col.livreur_id,
            "client": {"id": u.id, "name": u.name, "phone": u.phone} if u else None,
        })
    return result

@router.put("/collectes/{col_id}/status")
def update_collecte(
    col_id: int,
    payload: CollecteStatutBody,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    col = db.query(Collecte).filter(Collecte.id == col_id).first()
    if not col:
        raise HTTPException(404, "Introuvable")
    col.status = payload.status
    if payload.livreur_id:
        col.livreur_id = payload.livreur_id
    db.commit()
    notif_msgs = {
        "confirmée":  ("✅ Collecte confirmée", "Un livreur a été assigné à votre collecte."),
        "en_route":   ("🚐 Livreur en route !", "Votre livreur est en chemin."),
        "collectée":  ("📦 Articles collectés", "Vos articles ont été récupérés. Traitement en cours."),
        "annulée":    ("❌ Collecte annulée", "Votre demande de collecte a été annulée."),
    }
    if payload.status in notif_msgs:
        t, m = notif_msgs[payload.status]
        db.add(Notification(user_id=col.user_id, title=t, message=m, type="commande",
                           entity_id=col.id, route="/orders"))
        db.commit()
    _log(db, admin.id, f"Collecte #{col.id} → {payload.status}")
    return {"message": f"Collecte → {payload.status}"}

# ─────────────────────────────────────────────────────────────
# 5. GESTION DÉPÔTS
# ─────────────────────────────────────────────────────────────
@router.get("/depots")
def tous_depots(
    status: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    q = db.query(DemandeDepot)
    if status:
        q = q.filter(DemandeDepot.status == status)
    depots = q.order_by(desc(DemandeDepot.created_at)).all()
    result = []
    for d in depots:
        u = db.query(User).filter(User.id == d.user_id).first()
        result.append({
            "id": d.id, "montant": float(d.montant),
            "numero_transaction": d.numero_transaction,
            "operateur": d.operateur, "status": d.status,
            "capture_url": d.capture_url,
            "note_admin": d.note_admin,
            "created_at": str(d.created_at),
            "processed_at": str(d.processed_at) if d.processed_at else None,
            "client": {"id": u.id, "name": u.name, "phone": u.phone} if u else None,
        })
    return result

@router.put("/depots/{depot_id}/valider")
def valider(depot_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    d = db.query(DemandeDepot).filter(DemandeDepot.id == depot_id).first()
    if not d or d.status != "en_attente":
        raise HTTPException(400, "Introuvable ou déjà traitée")
    wallet = db.query(Wallet).filter(Wallet.user_id == d.user_id).first()
    if not wallet:
        wallet = Wallet(user_id=d.user_id, balance=0)
        db.add(wallet); db.flush()
    wallet.balance = (wallet.balance or Decimal("0")) + d.montant
    d.status = "validée"; d.admin_id = admin.id; d.processed_at = datetime.utcnow()
    tx = TransactionWallet(wallet_id=wallet.id, type="depot", amount=d.montant,
                           note=f"{d.operateur} - {d.numero_transaction}")
    db.add(tx)
    db.add(Notification(user_id=d.user_id, title="💰 Dépôt validé !",
                        message=f"Votre dépôt de {d.montant} FCFA a été crédité. Solde : {wallet.balance} FCFA",
                        type="wallet", route="/wallet"))
    db.commit()
    _log(db, admin.id, f"Dépôt #{depot_id} validé — {d.montant} FCFA → user #{d.user_id}")
    return {"message": "Validé", "nouveau_solde": float(wallet.balance)}

@router.put("/depots/{depot_id}/rejeter")
def rejeter(depot_id: int, note: str = "Non conforme", admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    d = db.query(DemandeDepot).filter(DemandeDepot.id == depot_id).first()
    if not d:
        raise HTTPException(404, "Introuvable")
    d.status = "rejetée"; d.admin_id = admin.id; d.note_admin = note; d.processed_at = datetime.utcnow()
    db.add(Notification(user_id=d.user_id, title="❌ Dépôt rejeté",
                        message=f"Votre dépôt de {d.montant} FCFA a été rejeté. Motif : {note}",
                        type="wallet", route="/wallet"))
    db.commit()
    _log(db, admin.id, f"Dépôt #{depot_id} rejeté — motif: {note}")
    return {"message": "Rejeté"}

# ─────────────────────────────────────────────────────────────
# 6. MESSAGERIE NÉGOCIATION
# ─────────────────────────────────────────────────────────────
@router.get("/messagerie")
def toutes_conversations(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    convs = db.query(NegoConversation).order_by(desc(NegoConversation.created_at)).all()
    result = []
    for conv in convs:
        u = db.query(User).filter(User.id == conv.user_id).first()
        f = db.query(Facture).filter(Facture.id == conv.facture_id).first()
        result.append({
            "id": conv.id, "status": conv.status,
            "admin_unread": conv.admin_unread,
            "remise_proposee": float(conv.remise_proposee or 0),
            "remise_acceptee": float(conv.remise_acceptee or 0),
            "created_at": str(conv.created_at),
            "client": {"name": u.name, "email": u.email} if u else None,
            "facture": {"id": f.id, "total": float(f.total)} if f else None,
        })
    return result

@router.get("/messagerie/{conv_id}")
def detail_conversation(conv_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    conv = db.query(NegoConversation).filter(NegoConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(404, "Introuvable")
    conv.admin_unread = 0
    db.commit()
    u = db.query(User).filter(User.id == conv.user_id).first()
    f = db.query(Facture).filter(Facture.id == conv.facture_id).first()
    messages = db.query(NegoMessage).filter(NegoMessage.conversation_id == conv_id).order_by(NegoMessage.created_at).all()
    return {
        "id": conv.id, "status": conv.status,
        "remise_proposee": float(conv.remise_proposee or 0),
        "remise_acceptee": float(conv.remise_acceptee or 0),
        "client": {"id": u.id, "name": u.name, "email": u.email} if u else None,
        "facture": {"id": f.id, "total": float(f.total), "status": f.status} if f else None,
        "messages": [{"id": m.id, "sender_id": m.sender_id, "type": m.type,
                      "content": m.content, "montant_offre": float(m.montant_offre or 0),
                      "statut_offre": m.statut_offre, "created_at": str(m.created_at)} for m in messages],
    }

@router.post("/messagerie/{conv_id}/offre")
def envoyer_offre_admin(
    conv_id: int, payload: OffreAdminCreate,
    admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    conv = db.query(NegoConversation).filter(NegoConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(404, "Introuvable")
    msg = NegoMessage(conversation_id=conv.id, sender_id=admin.id, type="offre",
                      content=payload.content, montant_offre=Decimal(str(payload.montant_offre)),
                      statut_offre="en_attente")
    db.add(msg)
    conv.status = "offre_envoyee"
    conv.remise_proposee = Decimal(str(payload.montant_offre))
    conv.client_unread = (conv.client_unread or 0) + 1
    db.commit()
    db.add(Notification(user_id=conv.user_id, title="🎉 Offre de réduction !",
                        message=f"L'admin vous propose {payload.montant_offre} FCFA de réduction.",
                        type="wallet", route="/wallet"))
    db.commit()
    return {"message": "Offre envoyée"}

@router.post("/messagerie/{conv_id}/message")
def message_admin(conv_id: int, content: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    conv = db.query(NegoConversation).filter(NegoConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(404, "Introuvable")
    db.add(NegoMessage(conversation_id=conv.id, sender_id=admin.id, type="texte", content=content))
    conv.client_unread = (conv.client_unread or 0) + 1
    db.commit()
    db.add(Notification(user_id=conv.user_id, title="💬 Nouveau message",
                        message="L'admin vous a répondu concernant votre facture.", type="wallet", route="/wallet"))
    db.commit()
    return {"message": "Envoyé"}

# ─────────────────────────────────────────────────────────────
# 7. TARIFS ET OFFRES
# ─────────────────────────────────────────────────────────────
@router.get("/tarifs")
def get_tarifs(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [{"id": t.id, "name": t.name, "price": float(t.price), "description": t.description}
            for t in db.query(TarifService).all()]

@router.post("/tarifs", status_code=201)
def create_tarif(payload: TarifUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    t = TarifService(name=payload.name, price=Decimal(str(payload.price)), description=payload.description)
    db.add(t); db.commit(); db.refresh(t)
    return {"id": t.id, "name": t.name, "price": float(t.price)}

@router.put("/tarifs/{tarif_id}")
def update_tarif(tarif_id: int, payload: TarifUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    t = db.query(TarifService).filter(TarifService.id == tarif_id).first()
    if not t:
        raise HTTPException(404, "Introuvable")
    t.name = payload.name; t.price = Decimal(str(payload.price)); t.description = payload.description
    db.commit()
    return {"message": "Tarif mis à jour"}

@router.delete("/tarifs/{tarif_id}")
def delete_tarif(tarif_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    t = db.query(TarifService).filter(TarifService.id == tarif_id).first()
    if not t:
        raise HTTPException(404, "Introuvable")
    db.delete(t); db.commit()
    return {"message": "Supprimé"}

@router.get("/offres")
def get_offres(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [{"id": o.id, "title": o.title, "description": o.description, "discount": float(o.discount),
             "start_date": str(o.start_date), "end_date": str(o.end_date), "active": o.active}
            for o in db.query(Offre).order_by(desc(Offre.start_date)).all()]

@router.post("/offres", status_code=201)
def create_offre(payload: OffreCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    from datetime import datetime as dt
    o = Offre(title=payload.title, description=payload.description,
              discount=Decimal(str(payload.discount)),
              start_date=dt.strptime(payload.start_date, "%Y-%m-%d"),
              end_date=dt.strptime(payload.end_date, "%Y-%m-%d"), active=True)
    db.add(o); db.commit(); db.refresh(o)
    # Notif broadcast
    clients = db.query(User).filter(User.role == "client").all()
    for u in clients:
        db.add(Notification(user_id=u.id, title=f"🎉 {payload.title}",
                            message=payload.description or "Nouvelle offre disponible !", type="promo", route="/home"))
    db.commit()
    _log(db, admin.id, f"Offre créée : {payload.title}")
    return {"message": "Offre créée", "id": o.id}

@router.put("/offres/{offre_id}/toggle")
def toggle_offre(offre_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    o = db.query(Offre).filter(Offre.id == offre_id).first()
    if not o:
        raise HTTPException(404, "Introuvable")
    o.active = not o.active
    db.commit()
    return {"message": f"Offre {'activée' if o.active else 'désactivée'}"}

# ─────────────────────────────────────────────────────────────
# 8. RAPPORTS FINANCIERS
# ─────────────────────────────────────────────────────────────
@router.get("/rapport")
def rapport_financier(
    mois: Optional[int] = None,
    annee: Optional[int] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    today = date.today()
    m = mois or today.month
    y = annee or today.year
    ca = float(db.query(func.sum(Facture.total)).filter(
        Facture.status == "soldée",
        func.extract("month", Facture.payee_le) == m,
        func.extract("year", Facture.payee_le) == y,
    ).scalar() or 0)
    remises = float(db.query(func.sum(Facture.remise + Facture.remise_nego)).filter(
        Facture.status == "soldée",
        func.extract("month", Facture.payee_le) == m,
    ).scalar() or 0)
    nb_cmd  = db.query(Commande).filter(func.extract("month", Commande.created_at) == m, func.extract("year", Commande.created_at) == y).count()
    nb_new  = db.query(User).filter(User.role == "client", func.extract("month", User.created_at) == m, func.extract("year", User.created_at) == y).count()
    depots  = float(db.query(func.sum(TransactionWallet.amount)).filter(
        TransactionWallet.type == "depot",
        func.extract("month", TransactionWallet.created_at) == m,
    ).scalar() or 0)
    parrain = float(db.query(func.sum(TransactionWallet.amount)).filter(
        TransactionWallet.type == "credit_parrainage",
        func.extract("month", TransactionWallet.created_at) == m,
    ).scalar() or 0)

    # Répartition par mode paiement
    wallet_ca = float(db.query(func.sum(Facture.total)).filter(
        Facture.status == "soldée", Facture.mode_paiement == "wallet",
        func.extract("month", Facture.payee_le) == m).scalar() or 0)
    liquide_ca = float(db.query(func.sum(Facture.total)).filter(
        Facture.status == "soldée", Facture.mode_paiement == "liquide",
        func.extract("month", Facture.payee_le) == m).scalar() or 0)

    return {
        "periode": f"{m:02d}/{y}",
        "ca_brut": ca,
        "remises_accordees": remises,
        "ca_net": ca - remises,
        "nb_commandes": nb_cmd,
        "nb_nouveaux_clients": nb_new,
        "total_depots_valides": depots,
        "total_recompenses_parrainage": parrain,
        "repartition_paiement": {"wallet": wallet_ca, "liquide": liquide_ca},
    }

# ─────────────────────────────────────────────────────────────
# 9. NOTIFICATIONS BROADCAST
# ─────────────────────────────────────────────────────────────
@router.post("/broadcast")
def broadcast(payload: NotifBroadcast, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    clients = db.query(User).filter(User.role == "client").all()
    for u in clients:
        db.add(Notification(user_id=u.id, title=payload.titre, message=payload.message, type="systeme"))
    db.commit()
    _log(db, admin.id, f"Broadcast : {payload.titre}")
    return {"message": f"Envoyé à {len(clients)} clients"}

# ─────────────────────────────────────────────────────────────
# 10. PARRAINAGE CONFIG
# ─────────────────────────────────────────────────────────────
@router.get("/parrainage/config")
def get_config(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.query(ConfigParrainage).first()
    if not c:
        c = ConfigParrainage(bonus_amount=1000, active=True)
        db.add(c); db.commit(); db.refresh(c)
    return {"bonus_amount": float(c.bonus_amount), "active": c.active}

@router.put("/parrainage/config")
def update_config(bonus: float, active: bool = True, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.query(ConfigParrainage).first()
    if not c:
        c = ConfigParrainage(); db.add(c)
    c.bonus_amount = Decimal(str(bonus)); c.active = active
    db.commit()
    return {"message": "Config parrainage mise à jour"}

@router.get("/parrainage/stats")
def parrainage_stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    total = db.query(Referral).filter(Referral.referred_id != None).count()
    rewarded = db.query(Referral).filter(Referral.rewarded == True).count()
    total_verse = float(db.query(func.sum(TransactionWallet.amount)).filter(
        TransactionWallet.type == "credit_parrainage").scalar() or 0)
    return {"total_parrainages": total, "recompenses_versees": rewarded, "total_verse_fcfa": total_verse}

# ─────────────────────────────────────────────────────────────
# 11. AUDIT LOGS
# ─────────────────────────────────────────────────────────────
@router.get("/audit")
def get_audit(limit: int = 50, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit).all()
    return [{"id": l.id, "admin_id": l.admin_id, "action": l.action, "created_at": str(l.created_at)} for l in logs]

# ─────────────────────────────────────────────────────────────
# HELPER AUDIT
# ─────────────────────────────────────────────────────────────
def _log(db: Session, admin_id: int, action: str):
    db.add(AuditLog(admin_id=admin_id, action=action))
    db.commit()

# ════════════════════════════════════════════════════════════════
# 6. INCLURE LE ROUTER DANS L'APPLICATION
# ════════════════════════════════════════════════════════════════
app.include_router(router)

# ════════════════════════════════════════════════════════════════
# 7. POINT D'ENTRÉE POUR RAILWAY
# ════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)