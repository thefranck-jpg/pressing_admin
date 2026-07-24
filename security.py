
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
import os

# ── CONFIG
SECRET_KEY  = os.getenv("SECRET_KEY", "pressing_j_secret_super_longue_2026_bala")
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


# HASH 

def hash_password(password: str) -> str:
    
    return pwd_context.hash(password[:72])

def verify_password(plain: str, hashed: str) -> bool:
   
    try:
        return pwd_context.verify(plain[:72], hashed)
    except Exception:
        return False


# JWT TOKENS

def create_token(user_id: int) -> str:
   
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "type": "user", "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM
    )

def create_admin_token(admin_id: int) -> str:
    """Token séparé pour les administrateurs (dashboard web)."""
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(admin_id), "type": "admin", "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM
    )


# DÉPENDANCES FASTAPI

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
):
    
    from models import User
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user

def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
):
    from models import User
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token admin invalide ou expiré")

    
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.role in ("admin", "super_admin"):
        return user

    
    try:
        from models import Admin
        admin = db.query(Admin).filter(Admin.id == user_id).first()
        if admin:
            return admin
    except Exception:
        pass

    raise HTTPException(status_code=403, detail="Accès admin requis")

def require_admin(current_user=Depends(get_current_admin)):
    """Protège les routes admin — utilise get_current_admin."""
    return current_user



# DÉPENDANCE POUR L'ÉQUIPE 
def get_current_team_member(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
):
    """
    Dépendance pour les routes équipe (laveurs, repasseurs, livreurs).
    Vérifie que l'utilisateur a un rôle équipe.
    """
    from models import User
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    
   
    if user.role not in ["laveur", "repasseur", "livreur"]:
        raise HTTPException(status_code=403, detail="Accès réservé à l'équipe")
    
    return user