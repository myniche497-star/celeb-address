import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import ws from "ws";

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
    throw new Error("CRITICAL SYSTEM CONFIGURATION FAULT: Environment matrix variables missing.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws }
});

export default async function handler(req, res) {
    // 1. CORS Headers
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, X-Action, X-Action-Phase, X-Transaction-Pin, X-User-UUID, X-Setting-Target, x-setting-target");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method blocked." });
    }

    try {
        const { email, password, signature } = req.body;

        if (!email || !password || !signature) {
            return res.status(400).json({ success: false, error: "Missing required identification keys." });
        }

        const cleanEmail = email.trim();
        const cleanSignature = signature.trim();

        // 2. Query admin schema using `email` and `signature`
        const { data: adminRecord, error: dbError } = await supabase
            .from("admin")
            .select("id, email, password, signature, api, domain_email")
            .ilike("email", cleanEmail)
            .eq("signature", cleanSignature)
            .maybeSingle();

        if (dbError) {
            throw new Error(`Database connection failed: ${dbError.message}`);
        }

        if (!adminRecord) {
            return res.status(401).json({
                success: false,
                error: `Administrative profile matching signature '${cleanSignature}' is not registered.`
            });
        }

        // 3. Password Validation against `password` column
        if (adminRecord.password !== password) {
            return res.status(401).json({ success: false, error: "Invalid password phase sequence." });
        }

        // 4. Encode Session JWT
        const sessionPayload = {
            adminId: adminRecord.id,
            email: adminRecord.email,
            signature: adminRecord.signature,
            role: "admin"
        };

        const token = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: "24h" });

        return res.status(200).json({
            success: true,
            message: "Administrative console access verified completely.",
            token: token
        });

    } catch (faultException) {
        console.error("❌ Auth Handshake Exception Node:", faultException.message);
        return res.status(500).json({ success: false, error: faultException.message });
    }
}