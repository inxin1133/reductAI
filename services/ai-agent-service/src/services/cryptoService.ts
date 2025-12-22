import crypto from "crypto"

// ⚠️ 중요: 운영에서는 별도의 암호화 키를 사용하는 것을 권장합니다.
// 현재 리포지토리의 서비스들은 공통으로 JWT_SECRET을 사용하고 있어, 여기서는 JWT_SECRET을 기반으로 대칭키를 생성합니다.
const SECRET = process.env.JWT_SECRET || "reductai_secure_jwt_secret_2025"

function key32() {
  // SHA256 해시로 32바이트 키 생성
  return crypto.createHash("sha256").update(SECRET).digest()
}

export function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex")
}

export function encryptApiKey(plain: string) {
  const key = key32()
  const iv = crypto.randomBytes(12) // GCM 권장 12 bytes
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  // 저장 포맷: base64(iv).base64(tag).base64(cipherText)
  const token = `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`
  return token
}

// 현재 Admin 화면에서는 복호화가 필요하지 않아서 decrypt는 노출하지 않습니다.


