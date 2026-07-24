from sqlalchemy import (Column, Integer, String, Text, Numeric, Boolean,
                        DateTime, Date, Float, ForeignKey, JSON)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# ── USERS
class User(Base):
    __tablename__ = "users"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(100))
    email       = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    role        = Column(String(20), default="client")
    sponsor_id  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at  = Column(DateTime, server_default=func.now())

    phone       = Column(String(20), nullable=True)
    address     = Column(Text, nullable=True)
    avatar_url  = Column(String(255), nullable=True)
    onboarding_done = Column(Boolean, default=False)
    referral_code   = Column(String(20), unique=True, nullable=True)
    fcm_token       = Column(String(512), nullable=True)
 

    employee_code = Column(String(20), unique=True, nullable=True)
    pin_hash = Column(Text, nullable=True)  # Stocké en SHA256
    zone = Column(String(100), nullable=True)  # Zone de travail
    specialty = Column(String(100), nullable=True)  # Pour laveurs (ex: "vêtements délicats")
    vehicle = Column(String(100), nullable=True)  # Pour livreurs (ex: "Moto", "Camionnette")
    is_online = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    # Relations
    wallet          = relationship("Wallet", back_populates="user", uselist=False)
    commandes       = relationship("Commande", back_populates="user", foreign_keys="Commande.user_id")
    collectes       = relationship("Collecte", back_populates="user")
    notifications   = relationship("Notification", back_populates="user")
    referrals_donnes = relationship("Referral", back_populates="sponsor", foreign_keys="Referral.sponsor_id")


# ── WALLET ────────────────────────────────────────────────────
class Wallet(Base):
    __tablename__ = "wallet"

    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"), unique=True)
    balance    = Column(Numeric(12, 2), default=0)

    user         = relationship("User", back_populates="wallet")
    transactions = relationship("TransactionWallet", back_populates="wallet")


# ── TRANSACTIONS WALLET ───────────────────────────────────────
class TransactionWallet(Base):
    __tablename__ = "transactions_wallet"

    id         = Column(Integer, primary_key=True)
    wallet_id  = Column(Integer, ForeignKey("wallet.id"))
    type       = Column(String(20))   # depot | retrait | paiement | credit_parrainage
    amount     = Column(Numeric(12, 2))
    note       = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    wallet = relationship("Wallet", back_populates="transactions")


# ── DEMANDES DEPOT ────────────────────────────────────────────
class DemandeDepot(Base):
    __tablename__ = "demandes_depot"

    id                 = Column(Integer, primary_key=True)
    user_id            = Column(Integer, ForeignKey("users.id"))
    montant            = Column(Numeric(12, 2))
    numero_transaction = Column(String(50))
    status             = Column(String(20), default="en_attente")
    operateur          = Column(String(30), nullable=True)
    capture_url        = Column(String(255), nullable=True)
    note_admin         = Column(Text, nullable=True)
    admin_id           = Column(Integer, nullable=True)
    created_at         = Column(DateTime, server_default=func.now())
    processed_at       = Column(DateTime, nullable=True)
    type               = Column(String(20), default="depot")  # "depot" ou "retrait"

    user = relationship("User", foreign_keys=[user_id])  
    
# ── COMMANDES 
class Commande(Base):
    __tablename__ = "commandes"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"))
    status          = Column(String(20), default="reçue")
    type_livraison  = Column(String(20), nullable=True)  # domicile | boutique
    note_client     = Column(Text, nullable=True)
    note_admin      = Column(Text, nullable=True)
    collecte_id     = Column(Integer, ForeignKey("collectes.id"), nullable=True)
    created_at      = Column(DateTime, server_default=func.now())

    user        = relationship("User", back_populates="commandes", foreign_keys=[user_id])
    items       = relationship("OrderItem", back_populates="commande", cascade="all, delete-orphan")
    facture     = relationship("Facture", back_populates="commande", uselist=False)
    historique  = relationship("StatutHistorique", back_populates="commande")
    collecte    = relationship("Collecte", back_populates="commandes", foreign_keys=[collecte_id])


# ── ORDER ITEMS 
class OrderItem(Base):
    __tablename__ = "order_items"

    id          = Column(Integer, primary_key=True)
    commande_id = Column(Integer, ForeignKey("commandes.id"))
    service_id  = Column(Integer, ForeignKey("tarifs_services.id"), nullable=True)
    designation = Column(String(100), nullable=True)
    quantity    = Column(Integer, default=1)
    price       = Column(Numeric(10, 2))
    status      = Column(String(30), default="collecté")
    photo_avant = Column(String(255), nullable=True)
    photo_apres = Column(String(255), nullable=True)

    commande = relationship("Commande", back_populates="items")
    service  = relationship("TarifService", foreign_keys=[service_id])


# ── STATUTS HISTORIQUE
class StatutHistorique(Base):
    __tablename__ = "statuts_historique"

    id          = Column(Integer, primary_key=True)
    commande_id = Column(Integer, ForeignKey("commandes.id"))
    old_status  = Column(String(20))
    new_status  = Column(String(20))
    changed_at  = Column(DateTime, server_default=func.now())

    commande = relationship("Commande", back_populates="historique")


# ── COLLECTES 
class Collecte(Base):
    __tablename__ = "collectes"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"))
    adresse      = Column(Text)
    latitude     = Column(Float, nullable=True)
    longitude    = Column(Float, nullable=True)
    quartier     = Column(String(100), nullable=True)
    creneau      = Column(String(20), nullable=True)  # 08h-10h | 10h-12h etc.
    scheduled_at = Column(DateTime)
    status       = Column(String(20), default="en_attente")
    note_client  = Column(Text, nullable=True)
    livreur_id   = Column(Integer, nullable=True)
    articles_prevus = Column(JSON, nullable=True)

    user      = relationship("User", back_populates="collectes")
    commandes = relationship("Commande", back_populates="collecte", foreign_keys="Commande.collecte_id")


# ── FACTURES 
class Facture(Base):
    __tablename__ = "factures"

    id          = Column(Integer, primary_key=True)
    commande_id = Column(Integer, ForeignKey("commandes.id"))
    total       = Column(Numeric(12, 2))
    remise      = Column(Numeric(12, 2), default=0)
    remise_nego = Column(Numeric(12, 2), default=0)
    status      = Column(String(20), default="en_attente")
    mode_paiement = Column(String(20), nullable=True)
    payee_le    = Column(DateTime, nullable=True)
    nego_ok     = Column(Boolean, default=True)
    created_at  = Column(DateTime, server_default=func.now())

    commande     = relationship("Commande", back_populates="facture")
    conversation = relationship("NegoConversation", back_populates="facture", uselist=False)


# ── REFERRALS (parrainage) 
class Referral(Base):
    __tablename__ = "referrals"

    id            = Column(Integer, primary_key=True)
    sponsor_id    = Column(Integer, ForeignKey("users.id"))
    referral_code = Column(String(20), unique=True)
    referred_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    rewarded      = Column(Boolean, default=False)
    reward_amount = Column(Numeric(10, 2), default=1000)
    created_at    = Column(DateTime, server_default=func.now())

    sponsor  = relationship("User", back_populates="referrals_donnes", foreign_keys=[sponsor_id])
    referred = relationship("User", foreign_keys=[referred_id])


# ── CONFIG PARRAINAGE
class ConfigParrainage(Base):
    __tablename__ = "config_parrainage"

    id           = Column(Integer, primary_key=True)
    bonus_amount = Column(Numeric(10, 2), default=1000)
    active       = Column(Boolean, default=True)


# ── NOTIFICATIONS 
class Notification(Base):
    __tablename__ = "notifications"

    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    title      = Column(String(100))
    message    = Column(Text)
    type       = Column(String(30), nullable=True)  # commande|wallet|promo|parrainage
    entity_id  = Column(Integer, nullable=True)
    route      = Column(String(60), nullable=True)
    read       = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="notifications")


# ── TARIFS SERVICES 
class TarifService(Base):
    __tablename__ = "tarifs_services"

    id          = Column(Integer, primary_key=True)
    name        = Column(String(100))
    price       = Column(Numeric(10, 2))
    description = Column(Text, nullable=True)


# ── OFFRES 
class Offre(Base):
    __tablename__ = "offres"

    id          = Column(Integer, primary_key=True)
    title       = Column(String(100))
    description = Column(Text, nullable=True)
    discount    = Column(Numeric(10, 2))
    start_date  = Column(DateTime)
    end_date    = Column(DateTime)
    active      = Column(Boolean, default=True)


# ── NEGO CONVERSATIONS 
class NegoConversation(Base):
    __tablename__ = "nego_conversations"

    id            = Column(Integer, primary_key=True)
    facture_id    = Column(Integer, ForeignKey("factures.id"), unique=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=True)
    admin_id      = Column(Integer, nullable=True)
    status        = Column(String(20), default="ouverte")
    remise_proposee = Column(Numeric(10, 2), nullable=True)
    remise_acceptee = Column(Numeric(10, 2), nullable=True)
    client_unread = Column(Integer, default=0)
    admin_unread  = Column(Integer, default=0)
    created_at    = Column(DateTime, server_default=func.now())

    facture  = relationship("Facture", back_populates="conversation")
    messages = relationship("NegoMessage", back_populates="conversation", cascade="all, delete-orphan")


# ── NEGO MESSAGES 
class NegoMessage(Base):
    __tablename__ = "nego_messages"

    id              = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("nego_conversations.id"))
    sender_id       = Column(Integer, ForeignKey("users.id"))
    type            = Column(String(20), default="texte") 
    content         = Column(Text)
    montant_offre   = Column(Numeric(10, 2), nullable=True)
    statut_offre    = Column(String(20), nullable=True)
    created_at      = Column(DateTime, server_default=func.now())

    conversation = relationship("NegoConversation", back_populates="messages")


# ── REVIEWS 
class Review(Base):
    __tablename__ = "reviews"

    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("users.id"))
    commande_id = Column(Integer, ForeignKey("commandes.id"))
    rating      = Column(Integer)
    comment     = Column(Text, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())


# ── AUDIT LOGS 
class AuditLog(Base):
    __tablename__ = "audit_logs"
 
    id         = Column(Integer, primary_key=True)
    admin_id   = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action     = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
 
# ── SERVICES 
class Service(Base):
    __tablename__ = "services"
    __table_args__ = {'extend_existing': True}  
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    price_per_hour = Column(Numeric(12, 2), default=0)
    icon = Column(String(50), default="construction_rounded")
    color = Column(String(20), default="#4FC3F7")
    category = Column(String(50), nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    # Relation bidirectionnelle avec Professional
    professionals = relationship("Professional", back_populates="service", cascade="all, delete-orphan")


# ── PROFESSIONNELS
class Professional(Base):
    __tablename__ = "professionals"
    __table_args__ = {'extend_existing': True} 
    
    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"))
    name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=False)
    description = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    
    zone = Column(String(100), nullable=True)
    adresse = Column(Text, nullable=True)
    disponible = Column(Boolean, default=True)
    years_experience = Column(Integer, default=0)
    
    service = relationship("Service", back_populates="professionals")


# ── RÉSERVATIONS DE SERVICES 
class ServiceReservation(Base):
    __tablename__ = "service_reservations"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    service_id = Column(Integer, ForeignKey("services.id"))
    professional_id = Column(Integer, ForeignKey("professionals.id"), nullable=True)
    adresse = Column(Text, nullable=False)
    latitude = Column(Float)
    longitude = Column(Float)
    quartier = Column(String(100), nullable=True)
    date = Column(Date, nullable=False)
    creneau = Column(String(20), nullable=False)
    duree_heures = Column(Integer, default=1)
    description_probleme = Column(Text, nullable=True)
    photo_url = Column(String(255), nullable=True)
    urgence = Column(Boolean, default=False)
    mode_paiement = Column(String(20), default="wallet")
    status = Column(String(20), default="en_attente")
    montant_total = Column(Numeric(12, 2))
    admin_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    progression = Column(Integer, default=0)
    statut_progression = Column(String(20), default="en_attente")
    
    # Relations
    user = relationship("User", foreign_keys=[user_id])
    service = relationship("Service")
    professional = relationship("Professional")