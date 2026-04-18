"""
Turnkey passkey registration + authenticator management endpoints.
All Turnkey API calls are signed server-side with the parent org API key.
"""

import os
import json
import base64
import logging
import time
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend

router = APIRouter(prefix="/passkey", tags=["passkey"])

TURNKEY_API_URL = "https://api.turnkey.com"
TURNKEY_ORG_ID = os.getenv("TURNKEY_ORG_ID", "")
TURNKEY_API_PUBLIC_KEY = os.getenv("TURNKEY_API_PUBLIC_KEY", "")
TURNKEY_API_PRIVATE_KEY = os.getenv("TURNKEY_API_PRIVATE_KEY", "")


class WalletAccount(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    curve: str
    path_format: str
    path: str
    address_format: str


class RegisterRequest(BaseModel):
    credential_id: str
    attestation: dict
    wallet_accounts: list[WalletAccount]
    api_public_key: str = ""


class RegisterResponse(BaseModel):
    sub_org_id: str
    address: str
    root_user_id: str


class AddAuthenticatorRequest(BaseModel):
    sub_org_id: str
    root_user_id: str
    credential_id: str
    attestation: dict


def _stamp_request(body_str: str) -> str:
    if not TURNKEY_API_PRIVATE_KEY:
        raise ValueError("TURNKEY_API_PRIVATE_KEY not configured")
    privkey_bytes = bytes.fromhex(TURNKEY_API_PRIVATE_KEY)
    private_key = ec.derive_private_key(
        int.from_bytes(privkey_bytes, "big"),
        ec.SECP256R1(),
        default_backend(),
    )
    signature = private_key.sign(body_str.encode(), ec.ECDSA(hashes.SHA256()))
    stamp = {
        "publicKey": TURNKEY_API_PUBLIC_KEY,
        "scheme": "SIGNATURE_SCHEME_TK_API_P256",
        "signature": signature.hex(),
    }
    return base64.urlsafe_b64encode(json.dumps(stamp).encode()).decode().rstrip("=")


async def _turnkey_post(path: str, body: dict) -> dict:
    body_str = json.dumps(body)
    stamp = _stamp_request(body_str)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TURNKEY_API_URL}{path}",
            content=body_str,
            headers={"Content-Type": "application/json", "X-Stamp": stamp},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Turnkey error: {resp.text}")
    return resp.json()


@router.post("/register", response_model=RegisterResponse)
async def register_passkey(req: RegisterRequest) -> RegisterResponse:
    if not TURNKEY_ORG_ID:
        raise HTTPException(status_code=503, detail="Turnkey not configured on this server")

    sub_org_name = f"avere-user-{int(time.time())}"
    body = {
        "timestampMs": str(int(time.time() * 1000)),
        "type": "ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V7",
        "organizationId": TURNKEY_ORG_ID,
        "parameters": {
            "subOrganizationName": sub_org_name,
            "rootQuorumThreshold": 1,
            "rootUsers": [
                {
                    "userName": sub_org_name,
                    "apiKeys": ([{
                        "apiKeyName": "avere-session",
                        "publicKey": req.api_public_key,
                        "curveType": "API_KEY_CURVE_P256",
                    }] if req.api_public_key else []),
                    "authenticators": [
                        {
                            "authenticatorName": "Passkey",
                            "challenge": req.credential_id,
                            "attestation": req.attestation,
                        }
                    ],
                    "oauthProviders": [],
                }
            ],
            "wallet": {
                "walletName": "Avere Solana Wallet",
                "accounts": [a.model_dump(by_alias=True) for a in req.wallet_accounts],
            },
        },
    }

    result = await _turnkey_post("/public/v1/submit/create_sub_organization", body)
    logging.info("Turnkey register response: %s", result)
    try:
        r = result["activity"]["result"]["createSubOrganizationResultV7"]
        sub_org_id = r["subOrganizationId"]
        address = r["wallet"]["addresses"][0]
        root_user_id = r["rootUserIds"][0]
    except (KeyError, IndexError) as e:
        raise HTTPException(status_code=502, detail=f"Unexpected Turnkey response: {e}")

    return RegisterResponse(sub_org_id=sub_org_id, address=address, root_user_id=root_user_id)


@router.post("/add_authenticator")
async def add_authenticator(req: AddAuthenticatorRequest) -> dict:
    """Add a new passkey credential to an existing sub-org user.
    Called when CREDENTIAL_NOT_FOUND occurs at signing time.
    """
    if not TURNKEY_ORG_ID:
        raise HTTPException(status_code=503, detail="Turnkey not configured on this server")

    body = {
        "timestampMs": str(int(time.time() * 1000)),
        "type": "ACTIVITY_TYPE_CREATE_AUTHENTICATORS_V2",
        "organizationId": req.sub_org_id,
        "parameters": {
            "userId": req.root_user_id,
            "authenticators": [
                {
                    "authenticatorName": "Avere Passkey",
                    "challenge": req.credential_id,
                    "attestation": req.attestation,
                }
            ],
        },
    }

    result = await _turnkey_post("/public/v1/submit/create_authenticators", body)
    logging.info("Turnkey add_authenticator response: %s", result)
    return {"ok": True}
