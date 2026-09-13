--
-- PostgreSQL database dump
--

\restrict Xjy8YlaEYeTgMXE9Vwq1gFdGPMfRIAQi0LctqV7dhHkbCHAGRUmE7KxT8u6X4Kn

-- Dumped from database version 18.6 (2078fcb)
-- Dumped by pg_dump version 18.6

-- Started on 2026-09-12 17:34:15 -05

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 6 (class 2615 OID 16528)
-- Name: neon_auth; Type: SCHEMA; Schema: -; Owner: neon_auth
--

CREATE SCHEMA neon_auth;


ALTER SCHEMA neon_auth OWNER TO neon_auth;

--
-- TOC entry 918 (class 1247 OID 17149)
-- Name: genero_enum; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.genero_enum AS ENUM (
    'Masculino',
    'Femenino',
    'otro'
);


ALTER TYPE public.genero_enum OWNER TO neondb_owner;

--
-- TOC entry 260 (class 1255 OID 16912)
-- Name: fn_gestion_inactivacion_usuario(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.fn_gestion_inactivacion_usuario() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (NEW.fecha_eliminado IS NOT NULL AND OLD.fecha_eliminado IS NULL) OR 
       (NEW.estados_id_estado = 2 AND OLD.estados_id_estado <> 2) THEN
        
        UPDATE vehiculos 
        SET fecha_eliminado = COALESCE(NEW.fecha_eliminado, NOW()),
            estados_id_estado = 2 
        WHERE usuarios_documento = NEW.documento AND fecha_eliminado IS NULL;

        UPDATE puestos 
        SET estado_puesto = FALSE
        WHERE id_puesto IN (
            SELECT p.id_puesto 
            FROM puestos p
            JOIN tickets t ON p.id_puesto = t.puestos_id_puesto
            WHERE t.usuarios_documento = NEW.documento
        );

        UPDATE contratos 
        SET fecha_eliminado = COALESCE(NEW.fecha_eliminado, NOW()),
            estados_id_estado = 2 
        WHERE usuarios_documento = NEW.documento AND fecha_eliminado IS NULL;

        UPDATE tickets 
        SET fecha_eliminado = COALESCE(NEW.fecha_eliminado, NOW()),
            estados_id_estado = 2,
            fecha_salida = COALESCE(fecha_salida, NOW()) 
        WHERE usuarios_documento = NEW.documento AND fecha_eliminado IS NULL;

    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_gestion_inactivacion_usuario() OWNER TO neondb_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 222 (class 1259 OID 16569)
-- Name: account; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" uuid NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE neon_auth.account OWNER TO neon_auth;

--
-- TOC entry 227 (class 1259 OID 16654)
-- Name: invitation; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.invitation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    email text NOT NULL,
    role text,
    status text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "inviterId" uuid NOT NULL
);


ALTER TABLE neon_auth.invitation OWNER TO neon_auth;

--
-- TOC entry 224 (class 1259 OID 16605)
-- Name: jwks; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.jwks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "publicKey" text NOT NULL,
    "privateKey" text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "expiresAt" timestamp with time zone
);


ALTER TABLE neon_auth.jwks OWNER TO neon_auth;

--
-- TOC entry 226 (class 1259 OID 16631)
-- Name: member; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    role text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);


ALTER TABLE neon_auth.member OWNER TO neon_auth;

--
-- TOC entry 225 (class 1259 OID 16617)
-- Name: organization; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.organization (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    "createdAt" timestamp with time zone NOT NULL,
    metadata text
);


ALTER TABLE neon_auth.organization OWNER TO neon_auth;

--
-- TOC entry 228 (class 1259 OID 16680)
-- Name: project_config; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.project_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    endpoint_id text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    trusted_origins jsonb NOT NULL,
    social_providers jsonb NOT NULL,
    email_provider jsonb,
    email_and_password jsonb,
    allow_localhost boolean NOT NULL,
    plugin_configs jsonb,
    webhook_config jsonb
);


ALTER TABLE neon_auth.project_config OWNER TO neon_auth;

--
-- TOC entry 221 (class 1259 OID 16547)
-- Name: session; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" uuid NOT NULL,
    "impersonatedBy" text,
    "activeOrganizationId" text
);


ALTER TABLE neon_auth.session OWNER TO neon_auth;

--
-- TOC entry 220 (class 1259 OID 16529)
-- Name: user; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth."user" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role text,
    banned boolean,
    "banReason" text,
    "banExpires" timestamp with time zone
);


ALTER TABLE neon_auth."user" OWNER TO neon_auth;

--
-- TOC entry 223 (class 1259 OID 16589)
-- Name: verification; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.verification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE neon_auth.verification OWNER TO neon_auth;

--
-- TOC entry 244 (class 1259 OID 17247)
-- Name: contratos; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.contratos (
    id_contrato integer NOT NULL,
    tarifa_id_tarifa integer NOT NULL,
    vehiculos_placa character varying(10) NOT NULL,
    usuarios_documento integer NOT NULL,
    estados_id_estado integer NOT NULL,
    fecha_inicio timestamp without time zone NOT NULL,
    fecha_fin timestamp without time zone NOT NULL,
    estado_pago boolean NOT NULL,
    fecha_eliminado timestamp without time zone,
    puestos_id_puesto integer
);


ALTER TABLE public.contratos OWNER TO neondb_owner;

--
-- TOC entry 243 (class 1259 OID 17246)
-- Name: contratos_id_contrato_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.contratos_id_contrato_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.contratos_id_contrato_seq OWNER TO neondb_owner;

--
-- TOC entry 3674 (class 0 OID 0)
-- Dependencies: 243
-- Name: contratos_id_contrato_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.contratos_id_contrato_seq OWNED BY public.contratos.id_contrato;


--
-- TOC entry 230 (class 1259 OID 17121)
-- Name: estados; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.estados (
    id_estado integer NOT NULL,
    nombre_estado character varying(50) NOT NULL,
    fecha_eliminado timestamp without time zone
);


ALTER TABLE public.estados OWNER TO neondb_owner;

--
-- TOC entry 229 (class 1259 OID 17120)
-- Name: estados_id_estado_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.estados_id_estado_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.estados_id_estado_seq OWNER TO neondb_owner;

--
-- TOC entry 3675 (class 0 OID 0)
-- Dependencies: 229
-- Name: estados_id_estado_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.estados_id_estado_seq OWNED BY public.estados.id_estado;


--
-- TOC entry 240 (class 1259 OID 17219)
-- Name: logs_sistema; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.logs_sistema (
    id_log integer NOT NULL,
    usuarios_documento integer NOT NULL,
    accion character varying(255) NOT NULL,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_eliminado timestamp without time zone
);


ALTER TABLE public.logs_sistema OWNER TO neondb_owner;

--
-- TOC entry 239 (class 1259 OID 17218)
-- Name: logs_sistema_id_log_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.logs_sistema_id_log_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.logs_sistema_id_log_seq OWNER TO neondb_owner;

--
-- TOC entry 3676 (class 0 OID 0)
-- Dependencies: 239
-- Name: logs_sistema_id_log_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.logs_sistema_id_log_seq OWNED BY public.logs_sistema.id_log;


--
-- TOC entry 242 (class 1259 OID 17235)
-- Name: puestos; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.puestos (
    id_puesto integer NOT NULL,
    numero_puesto integer NOT NULL,
    estado_puesto boolean DEFAULT false NOT NULL,
    fecha_eliminado timestamp without time zone
);


ALTER TABLE public.puestos OWNER TO neondb_owner;

--
-- TOC entry 241 (class 1259 OID 17234)
-- Name: puestos_id_puesto_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.puestos_id_puesto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.puestos_id_puesto_seq OWNER TO neondb_owner;

--
-- TOC entry 3677 (class 0 OID 0)
-- Dependencies: 241
-- Name: puestos_id_puesto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.puestos_id_puesto_seq OWNED BY public.puestos.id_puesto;


--
-- TOC entry 232 (class 1259 OID 17130)
-- Name: roles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.roles (
    id_roles integer NOT NULL,
    nombre_rol character varying(50) NOT NULL,
    fecha_eliminado timestamp without time zone
);


ALTER TABLE public.roles OWNER TO neondb_owner;

--
-- TOC entry 231 (class 1259 OID 17129)
-- Name: roles_id_roles_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.roles_id_roles_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roles_id_roles_seq OWNER TO neondb_owner;

--
-- TOC entry 3678 (class 0 OID 0)
-- Dependencies: 231
-- Name: roles_id_roles_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.roles_id_roles_seq OWNED BY public.roles.id_roles;


--
-- TOC entry 238 (class 1259 OID 17201)
-- Name: sugerencias; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.sugerencias (
    id_sugerencia integer NOT NULL,
    usuarios_documento integer NOT NULL,
    mensaje text NOT NULL,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_eliminado timestamp without time zone,
    resena integer DEFAULT 0 NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL
);


ALTER TABLE public.sugerencias OWNER TO neondb_owner;

--
-- TOC entry 237 (class 1259 OID 17200)
-- Name: sugerencias_id_sugerencia_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.sugerencias_id_sugerencia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sugerencias_id_sugerencia_seq OWNER TO neondb_owner;

--
-- TOC entry 3679 (class 0 OID 0)
-- Dependencies: 237
-- Name: sugerencias_id_sugerencia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.sugerencias_id_sugerencia_seq OWNED BY public.sugerencias.id_sugerencia;


--
-- TOC entry 234 (class 1259 OID 17139)
-- Name: tarifa; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.tarifa (
    id_tarifa integer NOT NULL,
    tipo_vehiculo character varying(50) NOT NULL,
    valor_minuto integer,
    valor_hora integer,
    valor_dia integer,
    valor_mes integer,
    fecha_eliminado timestamp without time zone,
    tipo_vehiculo_id integer
);


ALTER TABLE public.tarifa OWNER TO neondb_owner;

--
-- TOC entry 3680 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN tarifa.tipo_vehiculo; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.tarifa.tipo_vehiculo IS 'Modalidad del servicio: diario, mensual o por_hora';


--
-- TOC entry 233 (class 1259 OID 17138)
-- Name: tarifa_id_tarifa_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.tarifa_id_tarifa_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tarifa_id_tarifa_seq OWNER TO neondb_owner;

--
-- TOC entry 3681 (class 0 OID 0)
-- Dependencies: 233
-- Name: tarifa_id_tarifa_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.tarifa_id_tarifa_seq OWNED BY public.tarifa.id_tarifa;


--
-- TOC entry 246 (class 1259 OID 17282)
-- Name: tickets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.tickets (
    id_ticket integer NOT NULL,
    usuarios_documento integer NOT NULL,
    puestos_id_puesto integer NOT NULL,
    tarifa_id_tarifa integer NOT NULL,
    vehiculos_placa character varying(10) NOT NULL,
    estados_id_estado integer NOT NULL,
    fecha_ingreso timestamp without time zone NOT NULL,
    fecha_salida timestamp without time zone,
    valor_total integer NOT NULL,
    estado_pago boolean NOT NULL,
    fecha_eliminado timestamp without time zone,
    tipo_vehiculo_id integer
);


ALTER TABLE public.tickets OWNER TO neondb_owner;

--
-- TOC entry 245 (class 1259 OID 17281)
-- Name: tickets_id_ticket_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.tickets_id_ticket_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tickets_id_ticket_seq OWNER TO neondb_owner;

--
-- TOC entry 3682 (class 0 OID 0)
-- Dependencies: 245
-- Name: tickets_id_ticket_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.tickets_id_ticket_seq OWNED BY public.tickets.id_ticket;


--
-- TOC entry 248 (class 1259 OID 114689)
-- Name: tipos_vehiculo; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.tipos_vehiculo (
    id_tipo_vehiculo integer NOT NULL,
    nombre character varying(50) NOT NULL,
    icono character varying(10) DEFAULT '🚗'::character varying NOT NULL,
    fecha_eliminado timestamp without time zone
);


ALTER TABLE public.tipos_vehiculo OWNER TO neondb_owner;

--
-- TOC entry 247 (class 1259 OID 114688)
-- Name: tipos_vehiculo_id_tipo_vehiculo_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.tipos_vehiculo_id_tipo_vehiculo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tipos_vehiculo_id_tipo_vehiculo_seq OWNER TO neondb_owner;

--
-- TOC entry 3683 (class 0 OID 0)
-- Dependencies: 247
-- Name: tipos_vehiculo_id_tipo_vehiculo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.tipos_vehiculo_id_tipo_vehiculo_seq OWNED BY public.tipos_vehiculo.id_tipo_vehiculo;


--
-- TOC entry 235 (class 1259 OID 17155)
-- Name: usuarios; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.usuarios (
    documento integer NOT NULL,
    estados_id_estado integer NOT NULL,
    roles_id_roles integer NOT NULL,
    nombre character varying(100) NOT NULL,
    fecha_nacimiento date DEFAULT '2000-01-01'::date NOT NULL,
    telefono character varying(20) NOT NULL,
    correo character varying(100) NOT NULL,
    genero public.genero_enum,
    "contraseña" character varying(255) NOT NULL,
    fecha_eliminado timestamp without time zone,
    cargo character varying(50)
);


ALTER TABLE public.usuarios OWNER TO neondb_owner;

--
-- TOC entry 236 (class 1259 OID 17180)
-- Name: vehiculos; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.vehiculos (
    placa character varying(10) NOT NULL,
    usuarios_documento integer NOT NULL,
    estados_id_estado integer NOT NULL,
    tarifa_id_tarifa integer NOT NULL,
    color character varying(30) NOT NULL,
    fecha_eliminado timestamp without time zone,
    tipo_vehiculo_id integer
);


ALTER TABLE public.vehiculos OWNER TO neondb_owner;

--
-- TOC entry 3390 (class 2604 OID 17250)
-- Name: contratos id_contrato; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contratos ALTER COLUMN id_contrato SET DEFAULT nextval('public.contratos_id_contrato_seq'::regclass);


--
-- TOC entry 3378 (class 2604 OID 17124)
-- Name: estados id_estado; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.estados ALTER COLUMN id_estado SET DEFAULT nextval('public.estados_id_estado_seq'::regclass);


--
-- TOC entry 3386 (class 2604 OID 17222)
-- Name: logs_sistema id_log; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.logs_sistema ALTER COLUMN id_log SET DEFAULT nextval('public.logs_sistema_id_log_seq'::regclass);


--
-- TOC entry 3388 (class 2604 OID 17238)
-- Name: puestos id_puesto; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.puestos ALTER COLUMN id_puesto SET DEFAULT nextval('public.puestos_id_puesto_seq'::regclass);


--
-- TOC entry 3379 (class 2604 OID 17133)
-- Name: roles id_roles; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.roles ALTER COLUMN id_roles SET DEFAULT nextval('public.roles_id_roles_seq'::regclass);


--
-- TOC entry 3382 (class 2604 OID 17204)
-- Name: sugerencias id_sugerencia; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sugerencias ALTER COLUMN id_sugerencia SET DEFAULT nextval('public.sugerencias_id_sugerencia_seq'::regclass);


--
-- TOC entry 3380 (class 2604 OID 17142)
-- Name: tarifa id_tarifa; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tarifa ALTER COLUMN id_tarifa SET DEFAULT nextval('public.tarifa_id_tarifa_seq'::regclass);


--
-- TOC entry 3391 (class 2604 OID 17285)
-- Name: tickets id_ticket; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tickets ALTER COLUMN id_ticket SET DEFAULT nextval('public.tickets_id_ticket_seq'::regclass);


--
-- TOC entry 3392 (class 2604 OID 114692)
-- Name: tipos_vehiculo id_tipo_vehiculo; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tipos_vehiculo ALTER COLUMN id_tipo_vehiculo SET DEFAULT nextval('public.tipos_vehiculo_id_tipo_vehiculo_seq'::regclass);


--
-- TOC entry 3642 (class 0 OID 16569)
-- Dependencies: 222
-- Data for Name: account; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.account (id, "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", scope, password, "createdAt", "updatedAt") FROM stdin;
\.


--
-- TOC entry 3647 (class 0 OID 16654)
-- Dependencies: 227
-- Data for Name: invitation; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.invitation (id, "organizationId", email, role, status, "expiresAt", "createdAt", "inviterId") FROM stdin;
\.


--
-- TOC entry 3644 (class 0 OID 16605)
-- Dependencies: 224
-- Data for Name: jwks; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.jwks (id, "publicKey", "privateKey", "createdAt", "expiresAt") FROM stdin;
\.


--
-- TOC entry 3646 (class 0 OID 16631)
-- Dependencies: 226
-- Data for Name: member; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.member (id, "organizationId", "userId", role, "createdAt") FROM stdin;
\.


--
-- TOC entry 3645 (class 0 OID 16617)
-- Dependencies: 225
-- Data for Name: organization; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.organization (id, name, slug, logo, "createdAt", metadata) FROM stdin;
\.


--
-- TOC entry 3648 (class 0 OID 16680)
-- Dependencies: 228
-- Data for Name: project_config; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.project_config (id, name, endpoint_id, created_at, updated_at, trusted_origins, social_providers, email_provider, email_and_password, allow_localhost, plugin_configs, webhook_config) FROM stdin;
12bce630-2a9b-41f4-99e0-93823f8dab2b	Parqueadero la Pradera	ep-crimson-hall-ax3f9qvv	2026-09-07 18:32:34.716+00	2026-09-07 18:32:34.716+00	[]	[{"id": "google", "isShared": true}]	{"type": "shared"}	{"enabled": true, "disableSignUp": false, "emailVerificationMethod": "otp", "requireEmailVerification": false, "autoSignInAfterVerification": true, "sendVerificationEmailOnSignIn": false, "sendVerificationEmailOnSignUp": false}	t	{"magicLink": {"config": {"expiresIn": 5, "disableSignUp": false}, "enabled": false}, "phoneNumber": {"config": {"otp_expires_in": 300}, "enabled": false}, "organization": {"config": {"creatorRole": "owner", "membershipLimit": 100, "organizationLimit": 10, "sendInvitationEmail": false}, "enabled": true}}	{"enabled": false, "enabledEvents": [], "timeoutSeconds": 5}
\.


--
-- TOC entry 3641 (class 0 OID 16547)
-- Dependencies: 221
-- Data for Name: session; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.session (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId", "impersonatedBy", "activeOrganizationId") FROM stdin;
\.


--
-- TOC entry 3640 (class 0 OID 16529)
-- Dependencies: 220
-- Data for Name: user; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, banned, "banReason", "banExpires") FROM stdin;
\.


--
-- TOC entry 3643 (class 0 OID 16589)
-- Dependencies: 223
-- Data for Name: verification; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- TOC entry 3664 (class 0 OID 17247)
-- Dependencies: 244
-- Data for Name: contratos; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.contratos (id_contrato, tarifa_id_tarifa, vehiculos_placa, usuarios_documento, estados_id_estado, fecha_inicio, fecha_fin, estado_pago, fecha_eliminado, puestos_id_puesto) FROM stdin;
1	2	JKI123	92183614	1	2026-09-08 23:00:46.556113	2026-10-08 23:00:46.556113	f	\N	74
3	2	MLQ124	13421554	1	2026-09-10 21:14:03.491399	2026-10-10 21:14:03.491399	f	\N	17
2	2	MLO314	12098418	1	2026-09-10 15:25:43.273971	2026-10-10 15:25:43.273971	f	\N	95
\.


--
-- TOC entry 3650 (class 0 OID 17121)
-- Dependencies: 230
-- Data for Name: estados; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.estados (id_estado, nombre_estado, fecha_eliminado) FROM stdin;
1	activo	\N
2	inactivo	\N
3	trabajando	\N
4	descansando	\N
\.


--
-- TOC entry 3660 (class 0 OID 17219)
-- Dependencies: 240
-- Data for Name: logs_sistema; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.logs_sistema (id_log, usuarios_documento, accion, fecha, fecha_eliminado) FROM stdin;
1	1122338718	LOGIN	2026-09-08 20:13:33.213908	\N
2	1122338718	LOGIN	2026-09-08 20:59:41.488703	\N
3	1122338718	LOGIN	2026-09-08 22:43:28.115748	\N
4	1122338718	LOGIN	2026-09-08 22:47:00.288194	\N
5	1122338718	LOGIN	2026-09-08 22:56:16.078244	\N
6	1122338718	Registró vehículo JKI123 y creó cliente	2026-09-08 23:00:46.684994	\N
7	1122338718	Envió una sugerencia	2026-09-08 23:01:16.642654	\N
8	1122338718	Creó cliente 1246534 por ticket	2026-09-08 23:02:25.72139	\N
9	1122338718	Registró ticket para JLO214	2026-09-08 23:02:26.502865	\N
10	1122338718	Cerró ticket JLO214 por $3000	2026-09-08 23:02:52.223486	\N
11	1122338718	Registró ticket para JLO214	2026-09-08 23:03:14.180858	\N
12	1122338718	Creó cliente 82176473 por ticket	2026-09-08 23:03:52.450122	\N
13	1122338718	Registró ticket para MKI124	2026-09-08 23:03:53.179741	\N
14	1122338718	Cerró ticket JLO214 por $3000	2026-09-08 23:04:11.72032	\N
15	1122338718	Cerró ticket MKI124 por $3000	2026-09-08 23:04:19.717724	\N
16	1122338718	LOGIN	2026-09-09 00:27:27.777985	\N
17	1122338718	LOGIN	2026-09-10 15:25:19.39508	\N
18	1122338718	Registró vehículo MLO314 y creó cliente	2026-09-10 15:25:43.413113	\N
19	1122338718	Cambió estado del vehículo JKI123 a activo	2026-09-10 15:25:57.640327	\N
20	1122338718	Cambió estado del vehículo MLO314 a inactivo	2026-09-10 15:26:13.652854	\N
21	1122338718	Creó cliente 82193543 por ticket	2026-09-10 15:37:42.674522	\N
22	1122338718	Registró ticket para LMI123	2026-09-10 15:37:43.41177	\N
23	1122338718	Cerró ticket LMI123 por $3000	2026-09-10 15:38:21.444034	\N
24	1122338718	Registró ticket para LMI123	2026-09-10 15:38:40.364506	\N
25	1122338718	LOGIN	2026-09-10 18:50:24.087204	\N
26	1122338718	LOGIN	2026-09-10 18:50:24.627547	\N
27	11111111	LOGIN	2026-09-10 19:03:18.679813	\N
28	22222222	LOGIN	2026-09-10 19:06:16.768592	\N
29	22222222	Cerró ticket LMI123 por $12000	2026-09-10 19:09:56.482578	\N
30	11111111	LOGIN	2026-09-10 19:12:33.899753	\N
31	11111111	LOGIN	2026-09-10 19:12:34.557726	\N
32	11111111	Envió una sugerencia	2026-09-10 19:14:50.656043	\N
33	1122338718	LOGIN	2026-09-10 19:15:21.229433	\N
34	1122338718	Editó tarifa 1	2026-09-10 19:16:11.625309	\N
35	1122338718	Editó tarifa 2	2026-09-10 19:16:37.445102	\N
36	1122338718	Editó tarifa 3	2026-09-10 19:16:38.338219	\N
37	1122338718	Editó tarifa 3	2026-09-10 19:16:38.339211	\N
38	1122338718	Editó tarifa 1	2026-09-10 19:16:42.133827	\N
39	1122338718	Cambió estado del vehículo AAAAA a inactivo	2026-09-10 19:22:16.950132	\N
40	1122338718	Cambió estado del vehículo AAAAA a inactivo	2026-09-10 19:22:17.094325	\N
41	1122338718	Cambió estado del vehículo AAAAA a inactivo	2026-09-10 19:22:19.286699	\N
42	1122338718	Cambió estado del vehículo 111455 a activo	2026-09-10 19:22:37.839553	\N
43	1122338718	Cambió estado del vehículo ABC123 a activo	2026-09-10 19:22:53.897227	\N
44	1122338718	Cambió estado del vehículo JKI123 a inactivo	2026-09-10 19:23:30.511495	\N
45	1122338718	Cambió estado del vehículo JKI123 a activo	2026-09-10 19:23:35.404774	\N
46	1122338718	LOGIN	2026-09-10 19:37:20.49549	\N
47	1122338718	Ajustó total de puestos a 80	2026-09-10 19:37:35.264057	\N
48	1122338718	Editó vehículo MLO314	2026-09-10 19:50:41.949642	\N
49	1122338718	Editó vehículo MLO314	2026-09-10 19:50:52.314417	\N
50	1122338718	Editó vehículo JKI123	2026-09-10 19:51:02.930918	\N
51	1122338718	Editó vehículo JKI123	2026-09-10 19:51:11.933737	\N
52	1122338718	Editó vehículo JKI123	2026-09-10 20:22:57.35648	\N
53	1122338718	Editó vehículo JKI123	2026-09-10 20:22:58.155811	\N
54	1122338718	Editó vehículo JKI123	2026-09-10 20:23:10.641082	\N
55	1122338718	Registró empleado Cami	2026-09-10 20:24:24.249121	\N
56	1122338718	Editó empleado 87214309	2026-09-10 20:24:43.53907	\N
57	1122338718	Editó tarifa 1	2026-09-10 20:30:10.372151	\N
58	1122338718	Editó tarifa 1	2026-09-10 20:30:10.786181	\N
59	1122338718	Editó tarifa 1	2026-09-10 20:34:30.974081	\N
60	1122338718	Editó tarifa 1	2026-09-10 20:34:30.973908	\N
61	1122338718	Editó tarifa 1	2026-09-10 20:34:30.976001	\N
62	1122338718	Editó tarifa 1	2026-09-10 20:34:31.08911	\N
63	1122338718	Editó tarifa 1	2026-09-10 20:34:31.259557	\N
64	1122338718	Editó tarifa 1	2026-09-10 20:34:31.320059	\N
65	1122338718	Editó tarifa 1	2026-09-10 20:34:31.677809	\N
66	1122338718	Editó tarifa 1	2026-09-10 20:34:31.688565	\N
67	1122338718	Editó tarifa 1	2026-09-10 20:34:32.117091	\N
68	1122338718	Editó tarifa 1	2026-09-10 20:34:33.816631	\N
69	1122338718	Editó tarifa 3	2026-09-10 20:40:07.303595	\N
70	1122338718	Editó tarifa 2	2026-09-10 20:40:23.380812	\N
71	1122338718	Editó tarifa 2	2026-09-10 20:40:46.466968	\N
72	1122338718	Editó tarifa 2	2026-09-10 20:56:50.51336	\N
73	1122338718	Editó vehículo JKI123	2026-09-10 21:13:02.881726	\N
74	1122338718	Registró vehículo MLQ124 y creó cliente	2026-09-10 21:14:03.699744	\N
75	1122338718	Editó vehículo MLO314	2026-09-10 21:14:53.469044	\N
76	1122338718	Editó vehículo MLQ124	2026-09-10 21:15:11.489109	\N
77	11111111	LOGIN	2026-09-10 21:16:02.603862	\N
78	11111111	LOGIN	2026-09-10 21:16:08.432134	\N
79	11111111	Envió una sugerencia	2026-09-10 21:19:24.929133	\N
80	22222222	LOGIN	2026-09-10 21:22:04.103843	\N
81	22222222	LOGIN	2026-09-10 21:22:04.847544	\N
82	1122338718	LOGIN	2026-09-10 21:25:20.710278	\N
83	1122338718	LOGIN	2026-09-10 21:25:20.714368	\N
84	1122338718	Editó vehículo MLO314	2026-09-10 21:25:48.769226	\N
85	1122338718	Editó vehículo MLO314	2026-09-10 21:27:40.615202	\N
86	1122338718	Editó vehículo MLO314	2026-09-10 21:27:40.64365	\N
\.


--
-- TOC entry 3662 (class 0 OID 17235)
-- Dependencies: 242
-- Data for Name: puestos; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.puestos (id_puesto, numero_puesto, estado_puesto, fecha_eliminado) FROM stdin;
18	18	f	\N
1	20	f	\N
3	25	f	\N
4	26	f	\N
5	27	f	\N
7	11	f	\N
8	39	f	\N
10	66	f	\N
13	57	f	\N
20	64	f	\N
21	71	f	\N
22	2	f	\N
23	72	f	\N
24	47	f	\N
25	46	f	\N
27	15	f	\N
91	43	f	\N
46	55	f	\N
47	68	f	\N
48	38	f	\N
49	8	f	\N
100	7	f	\N
15	34	f	\N
12	33	f	\N
14	31	f	\N
9	17	f	\N
16	12	f	\N
28	77	f	\N
29	73	f	\N
17	10	t	\N
2	82	f	2026-09-10 19:37:35.150177
6	93	f	2026-09-10 19:37:35.150177
11	89	f	2026-09-10 19:37:35.150177
19	98	f	2026-09-10 19:37:35.150177
26	83	f	2026-09-10 19:37:35.150177
33	91	f	2026-09-10 19:37:35.150177
36	96	f	2026-09-10 19:37:35.150177
41	85	f	2026-09-10 19:37:35.150177
44	100	f	2026-09-10 19:37:35.150177
51	99	f	2026-09-10 19:37:35.150177
54	94	f	2026-09-10 19:37:35.150177
56	95	f	2026-09-10 19:37:35.150177
58	97	f	2026-09-10 19:37:35.150177
64	81	f	2026-09-10 19:37:35.150177
67	90	f	2026-09-10 19:37:35.150177
69	84	f	2026-09-10 19:37:35.150177
79	92	f	2026-09-10 19:37:35.150177
30	56	f	\N
31	40	f	\N
32	13	f	\N
34	21	f	\N
35	5	f	\N
84	86	f	2026-09-10 19:37:35.150177
94	87	f	2026-09-10 19:37:35.150177
99	88	f	2026-09-10 19:37:35.150177
37	19	f	\N
38	65	f	\N
39	52	f	\N
40	37	f	\N
42	32	f	\N
43	78	f	\N
50	80	f	\N
52	48	f	\N
53	28	f	\N
55	30	f	\N
57	62	f	\N
59	67	f	\N
60	50	f	\N
61	51	f	\N
62	76	f	\N
95	14	t	\N
63	69	f	\N
65	79	f	\N
66	42	f	\N
68	59	f	\N
92	3	f	\N
93	61	f	\N
96	35	f	\N
97	63	f	\N
98	9	f	\N
45	24	f	\N
74	16	t	\N
70	74	f	\N
71	6	f	\N
72	29	f	\N
73	41	f	\N
75	54	f	\N
76	36	f	\N
77	4	f	\N
78	53	f	\N
80	23	f	\N
81	44	f	\N
82	58	f	\N
83	1	f	\N
85	49	f	\N
86	22	f	\N
87	70	f	\N
88	45	f	\N
89	60	f	\N
90	75	f	\N
\.


--
-- TOC entry 3652 (class 0 OID 17130)
-- Dependencies: 232
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.roles (id_roles, nombre_rol, fecha_eliminado) FROM stdin;
1	gerente	\N
3	cliente	\N
2	empleado	\N
\.


--
-- TOC entry 3658 (class 0 OID 17201)
-- Dependencies: 238
-- Data for Name: sugerencias; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.sugerencias (id_sugerencia, usuarios_documento, mensaje, fecha, fecha_eliminado, resena, estado) FROM stdin;
1	1122338718	que cool la vida que crees?	2026-09-08 23:01:15.894889	\N	3	pendiente
2	11111111	esta muy oscuro en la zona b-4	2026-09-10 19:14:50.543544	\N	3	pendiente
3	11111111	ayer me robaron:c	2026-09-10 21:19:24.796996	\N	1	pendiente
\.


--
-- TOC entry 3654 (class 0 OID 17139)
-- Dependencies: 234
-- Data for Name: tarifa; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.tarifa (id_tarifa, tipo_vehiculo, valor_minuto, valor_hora, valor_dia, valor_mes, fecha_eliminado, tipo_vehiculo_id) FROM stdin;
1	diario	\N	\N	20000	\N	\N	1
3	por_hora	\N	4000	\N	\N	\N	1
2	mensual	\N	\N	\N	200000	\N	1
\.


--
-- TOC entry 3666 (class 0 OID 17282)
-- Dependencies: 246
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.tickets (id_ticket, usuarios_documento, puestos_id_puesto, tarifa_id_tarifa, vehiculos_placa, estados_id_estado, fecha_ingreso, fecha_salida, valor_total, estado_pago, fecha_eliminado, tipo_vehiculo_id) FROM stdin;
1	1246534	15	1	JLO214	1	2026-09-08 23:02:26.256053	2026-09-08 23:02:52.018504	3000	t	\N	\N
2	1246534	12	1	JLO214	1	2026-09-08 23:03:13.976611	2026-09-08 23:04:11.483502	3000	t	\N	\N
3	82176473	14	1	MKI124	1	2026-09-08 23:03:52.958835	2026-09-08 23:04:19.530052	3000	t	\N	\N
4	82193543	9	1	LMI123	1	2026-09-10 15:37:43.193293	2026-09-10 15:38:21.226239	3000	t	\N	\N
5	82193543	16	1	LMI123	1	2026-09-10 15:38:39.979527	2026-09-10 19:09:56.229228	12000	t	\N	\N
\.


--
-- TOC entry 3668 (class 0 OID 114689)
-- Dependencies: 248
-- Data for Name: tipos_vehiculo; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.tipos_vehiculo (id_tipo_vehiculo, nombre, icono, fecha_eliminado) FROM stdin;
1	Automóvil	🚗	\N
2	Moto	🏍️	\N
3	Camioneta	🚙	\N
4	Camión	🚚	\N
\.


--
-- TOC entry 3655 (class 0 OID 17155)
-- Dependencies: 235
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.usuarios (documento, estados_id_estado, roles_id_roles, nombre, fecha_nacimiento, telefono, correo, genero, "contraseña", fecha_eliminado, cargo) FROM stdin;
1122338718	1	1	Miguel	2008-05-10	3213750544	miguela.angelc1017@gmail.com	Masculino	$2a$10$OUOXnMbRMdY7XAZGFepDquUn2PQkT8YAIZMRPvb0XCuze1BXbLHf6	\N	4
12321431	4	2	Andrey	2000-01-01	312433213	Andrey@gmail.com	Masculino	$2a$10$sRDz.gruO0IQWLTiPP7tN.XVjfJ7A0F8w3kcCCQ91zyBBVLNwaPau	\N	Operativo
123124124	2	3	Ven	2000-01-01	31412452	Ven@gmail.com	Masculino	$2a$10$Iw79.LZWOMPfLnNR0tYaOuJREMJnRnQ9GB7fJ9qYqha1Dd6mu1I3O	2026-09-07 18:49:12.253	Vigilante
1246534	1	3	Visitante 1246534	2000-01-01	71264578	1246534@parqueadero.generado	otro	$2a$10$UZvxC.RTpQDOI27zVTumDeqnJvBYRXuaZcI8ZiXGZneI6PEftCmde	\N	\N
82176473	1	3	Visitante 82176473	2000-01-01	129843164	82176473@parqueadero.generado	otro	$2a$10$zzo6Xbk.8JDoX1KzL92Jt.NRNk/fcZ0wNaZWQ11b7HxP2BLRP8xsC	\N	\N
82193543	1	3	Visitante 82193543	2000-01-01	13451341	82193543@parqueadero.generado	otro	$2a$10$/BA1Y8JPINpHVOimEwofue.U13toZUj6ERigjZN0lvOlyTFLFnSjq	\N	\N
11111111	1	3	Angel	2005-04-10	302431243	angel@gmail.com	Masculino	$2a$10$LV5Yi0UmC3lClKoRnLNJs.EuKsZYndgfI36ATRD1UC2Rc6OEEw5.e	\N	cliente
87214309	3	2	Camilo	2000-01-01	1308421943	cami@gmail.com	Masculino	$2a$10$Ie8Q3KNvnGVclSeBC9adTertzbpxTz8Q.F2YY/9jw4NN8d1rk0Lhe	\N	Supervisor
92183614	1	3	camilo	2000-01-01	1827354	92183614@parqueadero.generado	otro	$2a$10$vRerr32qkAo3A9lXX6IzQe6S92yLyR8C.m0os/ThIuC5UlTdAs39a	\N	\N
13421554	1	3	Miller	2000-01-01	1243123431	13421554@parqueadero.generado	otro	$2a$10$qYT5L8.4CBGtJD1Eka6bnOAFOh85dP/mMfZkMeZ0B71gnSztfS2X2	\N	\N
22222222	4	2	mino	2004-10-02	10923321	mino@gmail.com	Masculino	$2a$10$AxMXKHvH9khBtqCmU.KITOE1KKuuuf4LrmrTggc3j2pTW9MTjNdQa	\N	empleado
12098418	1	3	Juan	2000-01-01	21378124	12098418@parqueadero.generado	otro	$2a$10$uViWrl/PEV42UyhZK1TSzemSfdY0fH5IuFhEYOA9PmW2tqAFdMWqe	\N	\N
\.


--
-- TOC entry 3656 (class 0 OID 17180)
-- Dependencies: 236
-- Data for Name: vehiculos; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.vehiculos (placa, usuarios_documento, estados_id_estado, tarifa_id_tarifa, color, fecha_eliminado, tipo_vehiculo_id) FROM stdin;
JLO214	1246534	1	1	No especificado	\N	\N
MKI124	82176473	1	1	No especificado	\N	\N
LMI123	82193543	1	1	No especificado	\N	\N
JKI123	92183614	1	2	Azula	\N	\N
MLQ124	13421554	2	2	amarillo	\N	\N
MLO314	12098418	1	2	Amarillo	\N	\N
\.


--
-- TOC entry 3684 (class 0 OID 0)
-- Dependencies: 243
-- Name: contratos_id_contrato_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.contratos_id_contrato_seq', 3, true);


--
-- TOC entry 3685 (class 0 OID 0)
-- Dependencies: 229
-- Name: estados_id_estado_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.estados_id_estado_seq', 9, true);


--
-- TOC entry 3686 (class 0 OID 0)
-- Dependencies: 239
-- Name: logs_sistema_id_log_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.logs_sistema_id_log_seq', 86, true);


--
-- TOC entry 3687 (class 0 OID 0)
-- Dependencies: 241
-- Name: puestos_id_puesto_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.puestos_id_puesto_seq', 100, true);


--
-- TOC entry 3688 (class 0 OID 0)
-- Dependencies: 231
-- Name: roles_id_roles_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.roles_id_roles_seq', 9, true);


--
-- TOC entry 3689 (class 0 OID 0)
-- Dependencies: 237
-- Name: sugerencias_id_sugerencia_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.sugerencias_id_sugerencia_seq', 3, true);


--
-- TOC entry 3690 (class 0 OID 0)
-- Dependencies: 233
-- Name: tarifa_id_tarifa_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.tarifa_id_tarifa_seq', 9, true);


--
-- TOC entry 3691 (class 0 OID 0)
-- Dependencies: 245
-- Name: tickets_id_ticket_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.tickets_id_ticket_seq', 5, true);


--
-- TOC entry 3692 (class 0 OID 0)
-- Dependencies: 247
-- Name: tipos_vehiculo_id_tipo_vehiculo_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.tipos_vehiculo_id_tipo_vehiculo_seq', 4, true);


--
-- TOC entry 3404 (class 2606 OID 16583)
-- Name: account account_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- TOC entry 3423 (class 2606 OID 16669)
-- Name: invitation invitation_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);


--
-- TOC entry 3410 (class 2606 OID 16616)
-- Name: jwks jwks_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.jwks
    ADD CONSTRAINT jwks_pkey PRIMARY KEY (id);


--
-- TOC entry 3418 (class 2606 OID 16643)
-- Name: member member_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);


--
-- TOC entry 3412 (class 2606 OID 16628)
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- TOC entry 3414 (class 2606 OID 16630)
-- Name: organization organization_slug_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.organization
    ADD CONSTRAINT organization_slug_key UNIQUE (slug);


--
-- TOC entry 3425 (class 2606 OID 16699)
-- Name: project_config project_config_endpoint_id_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.project_config
    ADD CONSTRAINT project_config_endpoint_id_key UNIQUE (endpoint_id);


--
-- TOC entry 3427 (class 2606 OID 16697)
-- Name: project_config project_config_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.project_config
    ADD CONSTRAINT project_config_pkey PRIMARY KEY (id);


--
-- TOC entry 3399 (class 2606 OID 16561)
-- Name: session session_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- TOC entry 3401 (class 2606 OID 16563)
-- Name: session session_token_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- TOC entry 3395 (class 2606 OID 16546)
-- Name: user user_email_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- TOC entry 3397 (class 2606 OID 16544)
-- Name: user user_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- TOC entry 3408 (class 2606 OID 16604)
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- TOC entry 3458 (class 2606 OID 17260)
-- Name: contratos contratos_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_pkey PRIMARY KEY (id_contrato);


--
-- TOC entry 3429 (class 2606 OID 17128)
-- Name: estados estados_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_pkey PRIMARY KEY (id_estado);


--
-- TOC entry 3452 (class 2606 OID 17228)
-- Name: logs_sistema logs_sistema_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.logs_sistema
    ADD CONSTRAINT logs_sistema_pkey PRIMARY KEY (id_log);


--
-- TOC entry 3456 (class 2606 OID 17244)
-- Name: puestos puestos_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.puestos
    ADD CONSTRAINT puestos_pkey PRIMARY KEY (id_puesto);


--
-- TOC entry 3433 (class 2606 OID 17137)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id_roles);


--
-- TOC entry 3449 (class 2606 OID 17212)
-- Name: sugerencias sugerencias_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sugerencias
    ADD CONSTRAINT sugerencias_pkey PRIMARY KEY (id_sugerencia);


--
-- TOC entry 3437 (class 2606 OID 17146)
-- Name: tarifa tarifa_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tarifa
    ADD CONSTRAINT tarifa_pkey PRIMARY KEY (id_tarifa);


--
-- TOC entry 3462 (class 2606 OID 17296)
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id_ticket);


--
-- TOC entry 3464 (class 2606 OID 114700)
-- Name: tipos_vehiculo tipos_vehiculo_nombre_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tipos_vehiculo
    ADD CONSTRAINT tipos_vehiculo_nombre_key UNIQUE (nombre);


--
-- TOC entry 3466 (class 2606 OID 114698)
-- Name: tipos_vehiculo tipos_vehiculo_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tipos_vehiculo
    ADD CONSTRAINT tipos_vehiculo_pkey PRIMARY KEY (id_tipo_vehiculo);


--
-- TOC entry 3442 (class 2606 OID 17167)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (documento);


--
-- TOC entry 3446 (class 2606 OID 17189)
-- Name: vehiculos vehiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_pkey PRIMARY KEY (placa);


--
-- TOC entry 3405 (class 1259 OID 16701)
-- Name: account_userId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "account_userId_idx" ON neon_auth.account USING btree ("userId");


--
-- TOC entry 3420 (class 1259 OID 16707)
-- Name: invitation_email_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX invitation_email_idx ON neon_auth.invitation USING btree (email);


--
-- TOC entry 3421 (class 1259 OID 16706)
-- Name: invitation_organizationId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "invitation_organizationId_idx" ON neon_auth.invitation USING btree ("organizationId");


--
-- TOC entry 3416 (class 1259 OID 16704)
-- Name: member_organizationId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "member_organizationId_idx" ON neon_auth.member USING btree ("organizationId");


--
-- TOC entry 3419 (class 1259 OID 16705)
-- Name: member_userId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "member_userId_idx" ON neon_auth.member USING btree ("userId");


--
-- TOC entry 3415 (class 1259 OID 16703)
-- Name: organization_slug_uidx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE UNIQUE INDEX organization_slug_uidx ON neon_auth.organization USING btree (slug);


--
-- TOC entry 3402 (class 1259 OID 16700)
-- Name: session_userId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "session_userId_idx" ON neon_auth.session USING btree ("userId");


--
-- TOC entry 3406 (class 1259 OID 16702)
-- Name: verification_identifier_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX verification_identifier_idx ON neon_auth.verification USING btree (identifier);


--
-- TOC entry 3459 (class 1259 OID 237575)
-- Name: idx_contratos_placa_activo; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_contratos_placa_activo ON public.contratos USING btree (vehiculos_placa, fecha_eliminado, fecha_fin);


--
-- TOC entry 3430 (class 1259 OID 188416)
-- Name: idx_estados_nombre_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_estados_nombre_unique ON public.estados USING btree (nombre_estado) WHERE (fecha_eliminado IS NULL);


--
-- TOC entry 3450 (class 1259 OID 237572)
-- Name: idx_logs_fecha; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_logs_fecha ON public.logs_sistema USING btree (fecha DESC);


--
-- TOC entry 3453 (class 1259 OID 237576)
-- Name: idx_puestos_estado; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_puestos_estado ON public.puestos USING btree (estado_puesto, fecha_eliminado);


--
-- TOC entry 3454 (class 1259 OID 17245)
-- Name: idx_puestos_numero_puesto_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_puestos_numero_puesto_unique ON public.puestos USING btree (numero_puesto) WHERE (fecha_eliminado IS NULL);


--
-- TOC entry 3431 (class 1259 OID 188417)
-- Name: idx_roles_nombre_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_roles_nombre_unique ON public.roles USING btree (nombre_rol) WHERE (fecha_eliminado IS NULL);


--
-- TOC entry 3447 (class 1259 OID 237573)
-- Name: idx_sugerencias_doc; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_sugerencias_doc ON public.sugerencias USING btree (usuarios_documento);


--
-- TOC entry 3434 (class 1259 OID 237574)
-- Name: idx_tarifa_modalidad_tipo; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tarifa_modalidad_tipo ON public.tarifa USING btree (tipo_vehiculo, tipo_vehiculo_id, fecha_eliminado);


--
-- TOC entry 3435 (class 1259 OID 221206)
-- Name: idx_tarifa_modalidad_tipo_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_tarifa_modalidad_tipo_unique ON public.tarifa USING btree (tipo_vehiculo, tipo_vehiculo_id) WHERE (fecha_eliminado IS NULL);


--
-- TOC entry 3460 (class 1259 OID 237571)
-- Name: idx_tickets_placa_estado; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tickets_placa_estado ON public.tickets USING btree (vehiculos_placa, fecha_eliminado, fecha_salida);


--
-- TOC entry 3438 (class 1259 OID 17179)
-- Name: idx_usuarios_correo_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_usuarios_correo_unique ON public.usuarios USING btree (correo) WHERE (fecha_eliminado IS NULL);


--
-- TOC entry 3439 (class 1259 OID 237577)
-- Name: idx_usuarios_nombre; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_usuarios_nombre ON public.usuarios USING btree (nombre);


--
-- TOC entry 3440 (class 1259 OID 17178)
-- Name: idx_usuarios_telefono_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_usuarios_telefono_unique ON public.usuarios USING btree (telefono) WHERE (fecha_eliminado IS NULL);


--
-- TOC entry 3443 (class 1259 OID 237569)
-- Name: idx_vehiculos_placa; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vehiculos_placa ON public.vehiculos USING btree (placa);


--
-- TOC entry 3444 (class 1259 OID 237570)
-- Name: idx_vehiculos_placa_upper; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vehiculos_placa_upper ON public.vehiculos USING btree (upper((placa)::text));


--
-- TOC entry 3492 (class 2620 OID 17322)
-- Name: usuarios tr_gestion_inactivacion_usuario; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER tr_gestion_inactivacion_usuario AFTER UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.fn_gestion_inactivacion_usuario();


--
-- TOC entry 3468 (class 2606 OID 16584)
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3471 (class 2606 OID 16675)
-- Name: invitation invitation_inviterId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.invitation
    ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3472 (class 2606 OID 16670)
-- Name: invitation invitation_organizationId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.invitation
    ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES neon_auth.organization(id) ON DELETE CASCADE;


--
-- TOC entry 3469 (class 2606 OID 16644)
-- Name: member member_organizationId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.member
    ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES neon_auth.organization(id) ON DELETE CASCADE;


--
-- TOC entry 3470 (class 2606 OID 16649)
-- Name: member member_userId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.member
    ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3467 (class 2606 OID 16564)
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3481 (class 2606 OID 114711)
-- Name: contratos contratos_puestos_id_puesto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_puestos_id_puesto_fkey FOREIGN KEY (puestos_id_puesto) REFERENCES public.puestos(id_puesto);


--
-- TOC entry 3482 (class 2606 OID 17276)
-- Name: contratos fk_con_estados; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT fk_con_estados FOREIGN KEY (estados_id_estado) REFERENCES public.estados(id_estado) ON UPDATE CASCADE;


--
-- TOC entry 3483 (class 2606 OID 17271)
-- Name: contratos fk_con_tarifa; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT fk_con_tarifa FOREIGN KEY (tarifa_id_tarifa) REFERENCES public.tarifa(id_tarifa) ON UPDATE CASCADE;


--
-- TOC entry 3484 (class 2606 OID 17261)
-- Name: contratos fk_con_usuarios; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT fk_con_usuarios FOREIGN KEY (usuarios_documento) REFERENCES public.usuarios(documento) ON UPDATE CASCADE;


--
-- TOC entry 3485 (class 2606 OID 17266)
-- Name: contratos fk_con_vehiculos; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT fk_con_vehiculos FOREIGN KEY (vehiculos_placa) REFERENCES public.vehiculos(placa) ON UPDATE CASCADE;


--
-- TOC entry 3480 (class 2606 OID 17229)
-- Name: logs_sistema fk_log_usuarios; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.logs_sistema
    ADD CONSTRAINT fk_log_usuarios FOREIGN KEY (usuarios_documento) REFERENCES public.usuarios(documento) ON UPDATE CASCADE;


--
-- TOC entry 3479 (class 2606 OID 17213)
-- Name: sugerencias fk_sug_usuarios; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sugerencias
    ADD CONSTRAINT fk_sug_usuarios FOREIGN KEY (usuarios_documento) REFERENCES public.usuarios(documento) ON UPDATE CASCADE;


--
-- TOC entry 3486 (class 2606 OID 17317)
-- Name: tickets fk_tic_estados; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_tic_estados FOREIGN KEY (estados_id_estado) REFERENCES public.estados(id_estado) ON UPDATE CASCADE;


--
-- TOC entry 3487 (class 2606 OID 17307)
-- Name: tickets fk_tic_puestos; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_tic_puestos FOREIGN KEY (puestos_id_puesto) REFERENCES public.puestos(id_puesto) ON UPDATE CASCADE;


--
-- TOC entry 3488 (class 2606 OID 17302)
-- Name: tickets fk_tic_tarifa; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_tic_tarifa FOREIGN KEY (tarifa_id_tarifa) REFERENCES public.tarifa(id_tarifa) ON UPDATE CASCADE;


--
-- TOC entry 3489 (class 2606 OID 17312)
-- Name: tickets fk_tic_usuarios; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_tic_usuarios FOREIGN KEY (usuarios_documento) REFERENCES public.usuarios(documento) ON UPDATE CASCADE;


--
-- TOC entry 3490 (class 2606 OID 17297)
-- Name: tickets fk_tic_vehiculos; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_tic_vehiculos FOREIGN KEY (vehiculos_placa) REFERENCES public.vehiculos(placa) ON UPDATE CASCADE;


--
-- TOC entry 3474 (class 2606 OID 17173)
-- Name: usuarios fk_usr_estados; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT fk_usr_estados FOREIGN KEY (estados_id_estado) REFERENCES public.estados(id_estado) ON UPDATE CASCADE;


--
-- TOC entry 3475 (class 2606 OID 17168)
-- Name: usuarios fk_usr_roles; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT fk_usr_roles FOREIGN KEY (roles_id_roles) REFERENCES public.roles(id_roles) ON UPDATE CASCADE;


--
-- TOC entry 3476 (class 2606 OID 17195)
-- Name: vehiculos fk_veh_estados; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT fk_veh_estados FOREIGN KEY (estados_id_estado) REFERENCES public.estados(id_estado) ON UPDATE CASCADE;


--
-- TOC entry 3477 (class 2606 OID 17190)
-- Name: vehiculos fk_veh_usuarios; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT fk_veh_usuarios FOREIGN KEY (usuarios_documento) REFERENCES public.usuarios(documento) ON UPDATE CASCADE;


--
-- TOC entry 3473 (class 2606 OID 114706)
-- Name: tarifa tarifa_tipo_vehiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tarifa
    ADD CONSTRAINT tarifa_tipo_vehiculo_id_fkey FOREIGN KEY (tipo_vehiculo_id) REFERENCES public.tipos_vehiculo(id_tipo_vehiculo);


--
-- TOC entry 3491 (class 2606 OID 114716)
-- Name: tickets tickets_tipo_vehiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_tipo_vehiculo_id_fkey FOREIGN KEY (tipo_vehiculo_id) REFERENCES public.tipos_vehiculo(id_tipo_vehiculo);


--
-- TOC entry 3478 (class 2606 OID 114701)
-- Name: vehiculos vehiculos_tipo_vehiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_tipo_vehiculo_id_fkey FOREIGN KEY (tipo_vehiculo_id) REFERENCES public.tipos_vehiculo(id_tipo_vehiculo);


--
-- TOC entry 2142 (class 826 OID 16399)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- TOC entry 2141 (class 826 OID 16398)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


-- Completed on 2026-09-12 17:34:33 -05

--
-- PostgreSQL database dump complete
--

\unrestrict Xjy8YlaEYeTgMXE9Vwq1gFdGPMfRIAQi0LctqV7dhHkbCHAGRUmE7KxT8u6X4Kn

