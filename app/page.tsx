"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C } from "@/lib/tema";
import { TarjetaEstadistica, Tarjeta, Etiqueta, Modal, FilaFormulario, Boton } from "@/lib/componentes";
import { useAuth } from "@/lib/auth";
import { alertaError, alertaExito, alertaAdvertencia, confirmar } from "@/lib/alerta";
import { esEnteroPositivo } from "@/lib/validacion";
import { fetchSeguro } from "@/lib/fetchSeguro";

interface VehiculoDash {
  placa: string;
  nombre: string;
  tipo: string;
  estado: string;
}

interface SugerenciaDash {
  usuario: string;
  texto: string;
  estado: string;
}

interface ResumenPuestos {
  totalPuestos: number;
  puestosOcupados: number;
  puestosDisponibles: number;
}

interface TarifaAdmin {
  id: string;
  modalidad: string;
  tipo_vehiculo_id: string;
  tipo_vehiculo_nombre: string;
  tipo_vehiculo_icono: string;
  valor_hora: number | null;
  valor_dia: number | null;
  valor_mes: number | null;
}

interface TipoVehiculo {
  id: string;
  nombre: string;
  icono: string;
}

export default function Inicio() {
  const { user } = useAuth();
  const router = useRouter();
  const [empleadosCount, setEmpleadosCount] = useState(0);
  const [vehiculos, setVehiculos] = useState<VehiculoDash[]>([]);
  const [sugerencias, setSugerencias] = useState<SugerenciaDash[]>([]);

  const [stats, setStats] = useState<ResumenPuestos>({
    totalPuestos: 0,
    puestosOcupados: 0,
    puestosDisponibles: 0,
  });
  const [tarifas, setTarifas] = useState<TarifaAdmin[]>([]);
  const [tiposVeh, setTiposVeh] = useState<TipoVehiculo[]>([]);
  const [totalInput, setTotalInput] = useState("");
  const [modal, setModal] = useState<"tarifas" | "puestos" | null>(null);
  const [tarifaEditando, setTarifaEditando] = useState<string | null>(null);
  const [nuevaTarifa, setNuevaTarifa] = useState({
    tipoVehiculoId: "",
    modalidad: "diario",
    valor: "",
  });

  useEffect(() => {
    async function load() {
      try {
        const [empleadosRes, sugerenciasRes, vehiculosRes] = await Promise.all([
          fetch("/api/usuarios?rol=empleado&tamano=1").then(r => r.json()),
          fetch("/api/sugerencias").then(r => r.json()),
          fetch("/api/vehiculos?tamano=4").then(r => r.json()),
        ]);

        setEmpleadosCount(typeof empleadosRes?.total === "number" ? empleadosRes.total : 0);

        const s = Array.isArray(sugerenciasRes)
          ? sugerenciasRes.map((s: any) => ({
              usuario: s.usuario,
              texto: s.texto,
              estado: s.estado,
            }))
          : [];

        const v = Array.isArray(vehiculosRes?.datos)
          ? vehiculosRes.datos.map((veh: any) => ({
              placa: veh.placa,
              nombre: veh.nombre,
              tipo: veh.tipo,
              estado: veh.estado,
            }))
          : [];

        setSugerencias(s);
        setVehiculos(v);
      } catch (e) {
        console.error("Error cargando dashboard", e);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (user?.role !== "gerente") return;

    async function loadConfig() {
      try {
        const [statsRes, tarifasRes, tiposRes] = await Promise.all([
          fetch("/api/estadisticas").then(r => r.json()),
          fetch("/api/tarifas/admin").then(r => r.json()),
          fetch("/api/vehiculos?recurso=tipos").then(r => r.json()),
        ]);

        if (statsRes?.totalPuestos !== undefined) {
          setStats({
            totalPuestos: statsRes.totalPuestos ?? 0,
            puestosOcupados: statsRes.puestosOcupados ?? 0,
            puestosDisponibles: statsRes.puestosDisponibles ?? 0,
          });
          setTotalInput(String(statsRes.totalPuestos ?? 0));
        }
        if (Array.isArray(tarifasRes)) setTarifas(tarifasRes);
        if (Array.isArray(tiposRes)) setTiposVeh(tiposRes);
      } catch (e) {
        console.error("Error cargando configuración", e);
      }
    }
    loadConfig();
  }, [user]);

  useEffect(() => {
    if (user?.role === "cliente") {
      router.replace("/perfil");
    }
  }, [user, router]);

  const activos = vehiculos.filter(v => v.estado === "activo").length;
  const mensuales = vehiculos.filter(v => v.tipo === "mensual" && v.estado === "activo").length;
  const pendientes = sugerencias.filter(s => s.estado === "pendiente").length;

  const refrescarConfig = async () => {
    const [statsRes, tarifasRes] = await Promise.all([
      fetch("/api/estadisticas").then(r => r.json()),
      fetch("/api/tarifas/admin").then(r => r.json()),
    ]);
    if (statsRes?.totalPuestos !== undefined) {
      setStats({
        totalPuestos: statsRes.totalPuestos ?? 0,
        puestosOcupados: statsRes.puestosOcupados ?? 0,
        puestosDisponibles: statsRes.puestosDisponibles ?? 0,
      });
      setTotalInput(String(statsRes.totalPuestos ?? 0));
    }
    if (Array.isArray(tarifasRes)) setTarifas(tarifasRes);
  };

  const guardarPuestos = async () => {
    const res = await fetchSeguro("/api/vehiculos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total: Number(totalInput) }),
    });
    const data = await res.json();
    if (!res.ok) {
      alertaError(data.error || "No se pudo ajustar");
      return;
    }
    alertaExito(`Puestos actualizados a ${data.total}`);
    setModal(null);
    await refrescarConfig();
  };

  const etiquetaValor = (m: string) =>
    m === "por_hora" ? "Valor por hora" : m === "diario" ? "Valor por día" : "Valor por mes";

  const extraerValor = (t: TarifaAdmin) =>
    t.modalidad === "por_hora" ? t.valor_hora : t.modalidad === "diario" ? t.valor_dia : t.valor_mes;

  const cargarTarifa = (t: TarifaAdmin) => {
    setTarifaEditando(t.id);
    setNuevaTarifa({
      tipoVehiculoId: t.tipo_vehiculo_id ?? "",
      modalidad: t.modalidad,
      valor: String(extraerValor(t) ?? ""),
    });

    // Lleva el foco al formulario inferior del modal.
    requestAnimationFrame(() => {
      document.getElementById("form-tarifa")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const resetTarifa = () => {
    setTarifaEditando(null);
    setNuevaTarifa({ tipoVehiculoId: "", modalidad: "diario", valor: "" });
  };

  const guardarTarifa = async () => {
    if (!nuevaTarifa.tipoVehiculoId) {
      alertaAdvertencia(
        tiposVeh.length > 0
          ? "Seleccione el tipo de vehículo"
          : "Cargando tipos de vehículo, espere un momento…"
      );
      return;
    }
    const valorNum = Number(nuevaTarifa.valor);
    if (!esEnteroPositivo(valorNum)) {
      alertaAdvertencia("Ingrese un valor entero positivo");
      return;
    }

    // El id a editar sale de dos fuentes:
    //   1. El botón "Editar" (tarifaEditando).
    //   2. Si no hay selección explícita, se busca una tarifa con la misma
    //      combinación (tipo, modalidad) para editar en vez de crear.
    //      Así el POST nunca choca con el índice único y no responde 409.
    let idEditar = tarifaEditando;
    if (!idEditar) {
      const existente = tarifas.find(t =>
        String(t.tipo_vehiculo_id) === String(nuevaTarifa.tipoVehiculoId) &&
        t.modalidad === nuevaTarifa.modalidad
      );
      if (existente) idEditar = existente.id;
    }

    // Solo se envía el campo correspondiente a la modalidad; los otros dos van en null
    // para que al cambiar de modalidad no queden valores antiguos mezclados.
    const payload = {
      tipoVehiculoId: Number(nuevaTarifa.tipoVehiculoId),
      modalidad: nuevaTarifa.modalidad,
      valorHora: nuevaTarifa.modalidad === "por_hora" ? valorNum : null,
      valorDia: nuevaTarifa.modalidad === "diario" ? valorNum : null,
      valorMes: nuevaTarifa.modalidad === "mensual" ? valorNum : null,
    };

    const res = idEditar
      ? await fetchSeguro(`/api/tarifas/${idEditar}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetchSeguro("/api/tarifas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const data = await res.json();
    if (!res.ok) {
      alertaError(data.error || "No se pudo guardar la tarifa");
      return;
    }

    alertaExito(idEditar ? "Tarifa actualizada" : "Tarifa creada");
    resetTarifa();
    await refrescarConfig();
  };

  const eliminarTarifa = async (id: string) => {
    if (!(await confirmar("¿Eliminar esta tarifa?"))) return;
    const res = await fetchSeguro(`/api/tarifas/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alertaError(data.error || "No se pudo eliminar la tarifa");
      return;
    }
    if (tarifaEditando === id) resetTarifa();
    alertaExito("Tarifa eliminada");
    await refrescarConfig();
  };

  return (
    <div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24, marginBottom: 6 }}>
        ¡Qué más, {user?.name.split(" ")[0]}! 👋
      </h2>
      <p style={{ color: C.sub, marginBottom: 28 }}>Resumen del sistema — Parqueadero La Pradera</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16, marginBottom: 28 }}>
        <TarjetaEstadistica icon="🚗" label="Vehículos activos" value={activos} color={C.accent} />
        <TarjetaEstadistica icon="📅" label="Mensuales" value={mensuales} color={C.accent2} />
        {user?.role !== "cliente" && <TarjetaEstadistica icon="👷" label="Empleados" value={empleadosCount} color={C.green} />}
        <TarjetaEstadistica icon="💬" label="Sugerencias" value={pendientes} color={C.gold} />
      </div>

      {user?.role === "gerente" && (
        <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
          <Tarjeta>
            <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 10 }}>Espacios del parqueadero</h3>
            <p style={{ color: C.sub, fontSize: 13 }}>
              Total actual: <b>{stats.totalPuestos}</b> · Ocupados: <b>{stats.puestosOcupados}</b> · Libres: <b>{stats.puestosDisponibles}</b>
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <input
                type="number"
                value={totalInput}
                onChange={e => setTotalInput(e.target.value)}
                min={1}
                max={1000}
                style={{ maxWidth: 120 }}
              />
              <Boton onClick={() => setModal("puestos")}>Ajustar total</Boton>
            </div>
          </Tarjeta>

          <Tarjeta>
            <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 10 }}>Tarifas</h3>
            <p style={{ color: C.sub, fontSize: 13 }}>
              {tarifas.length} tarifa{tarifas.length === 1 ? "" : "s"} configurada{tarifas.length === 1 ? "" : "s"}
            </p>
            <div style={{ marginTop: 12 }}>
              <Boton onClick={() => setModal("tarifas")}>Gestionar tarifas</Boton>
            </div>
          </Tarjeta>
        </div>
      )}

      <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Tarjeta>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 14 }}>Últimas Sugerencias</h3>
          {sugerencias.slice(0, 3).map(s => (
            <div key={s.usuario + s.texto} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.usuario}</span>
                <Etiqueta label={s.estado} color={s.estado === "pendiente" ? "gold" : "blue"} />
              </div>
              <p style={{ color: C.sub, fontSize: 13 }}>{s.texto.slice(0, 60)}</p>
            </div>
          ))}
        </Tarjeta>
        <Tarjeta>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 14 }}>Vehículos Recientes</h3>
          {vehiculos.slice(0, 4).map(v => (
            <div key={v.placa} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13 }}>{v.placa}</p>
                <p style={{ color: C.sub, fontSize: 12 }}>{v.nombre}</p>
              </div>
              <Etiqueta label={v.tipo} color={v.tipo === "mensual" ? "blue" : "green"} />
            </div>
          ))}
        </Tarjeta>
      </div>

      {modal === "puestos" && (
        <Modal title="Confirmar nuevo total de puestos" onClose={() => setModal(null)}>
          <p style={{ fontSize: 14, marginBottom: 10 }}>
            Cambiarás el total de <b>{stats.totalPuestos}</b> a <b>{totalInput}</b>.
            No podrás reducir por debajo de los puestos ocupados ({stats.puestosOcupados}).
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <Boton onClick={guardarPuestos} data-nav-submit style={{ flex: 1 }}>Confirmar</Boton>
            <Boton variant="ghost" onClick={() => setModal(null)} style={{ flex: 1 }}>Cancelar</Boton>
          </div>
        </Modal>
      )}

      {modal === "tarifas" && (
        <Modal
          title="Gestionar tarifas"
          onClose={() => { setModal(null); resetTarifa(); }}
        >
          <div style={{ marginBottom: 20 }}>
            {tarifas.map(t => (
              <div
                key={t.id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>
                    {t.tipo_vehiculo_icono} {t.tipo_vehiculo_nombre}
                    <span style={{ color: C.sub, fontWeight: 400, marginLeft: 8 }}>
                      · {t.modalidad}
                    </span>
                  </p>
                  <p style={{ color: C.gold, fontWeight: 700, fontSize: 14, marginTop: 2 }}>
                    ${(extraerValor(t) ?? 0).toLocaleString("es-CO")}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Boton small variant="outline" onClick={() => cargarTarifa(t)}>Editar</Boton>
                  <Boton small danger onClick={() => eliminarTarifa(t.id)}>Eliminar</Boton>
                </div>
              </div>
            ))}
            {tarifas.length === 0 && (
              <p style={{ color: C.sub, fontSize: 13, padding: "10px 0" }}>Sin tarifas configuradas.</p>
            )}
          </div>

          {tarifaEditando && (
            <p style={{ color: C.gold, fontSize: 12, marginBottom: 8 }}>
              Editando tarifa existente. Cambia el valor o la modalidad y guarda.
            </p>
          )}

          <h4 id="form-tarifa" style={{ fontFamily: "Syne", marginBottom: 10 }}>
            {tarifaEditando ? "Editando tarifa seleccionada" : "Nueva tarifa"}
          </h4>
          <FilaFormulario label="Tipo de vehículo">
            <select
              value={nuevaTarifa.tipoVehiculoId}
              onChange={e => setNuevaTarifa({ ...nuevaTarifa, tipoVehiculoId: e.target.value })}
            >
              <option value="">Seleccione…</option>
              {tiposVeh.map(tv => (
                <option key={tv.id} value={tv.id}>{tv.icono} {tv.nombre}</option>
              ))}
            </select>
          </FilaFormulario>

          <FilaFormulario label="Modalidad">
            <select
              value={nuevaTarifa.modalidad}
              onChange={e => setNuevaTarifa({ ...nuevaTarifa, modalidad: e.target.value })}
            >
              <option value="por_hora">Por hora</option>
              <option value="diario">Diario</option>
              <option value="mensual">Mensual</option>
            </select>
          </FilaFormulario>

          <FilaFormulario label={etiquetaValor(nuevaTarifa.modalidad)}>
            <input
              type="number"
              value={nuevaTarifa.valor}
              onChange={e => setNuevaTarifa({ ...nuevaTarifa, valor: e.target.value })}
              placeholder="Ej: 18000"
            />
          </FilaFormulario>

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Boton onClick={guardarTarifa} data-nav-submit style={{ flex: 1 }}>
              {tarifaEditando ? "Guardar cambios" : "Añadir tarifa"}
            </Boton>
            {tarifaEditando && (
              <Boton variant="ghost" onClick={resetTarifa} style={{ flex: 1 }}>Cancelar</Boton>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
