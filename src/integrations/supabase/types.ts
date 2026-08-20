export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      accesorios: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_accesorio"]
          costo: number
          created_at: string
          id: string
          minimo: number
          modelo: string | null
          nombre: string
          precio: number
          tipo: string | null
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_accesorio"]
          costo?: number
          created_at?: string
          id?: string
          minimo?: number
          modelo?: string | null
          nombre: string
          precio?: number
          tipo?: string | null
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_accesorio"]
          costo?: number
          created_at?: string
          id?: string
          minimo?: number
          modelo?: string | null
          nombre?: string
          precio?: number
          tipo?: string | null
        }
        Relationships: []
      }
      accesorios_stock: {
        Row: {
          accesorio_id: string
          cantidad: number
          id: string
          tienda_id: string
        }
        Insert: {
          accesorio_id: string
          cantidad?: number
          id?: string
          tienda_id: string
        }
        Update: {
          accesorio_id?: string
          cantidad?: number
          id?: string
          tienda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accesorios_stock_accesorio_id_fkey"
            columns: ["accesorio_id"]
            isOneToOne: false
            referencedRelation: "accesorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accesorios_stock_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          accion: string
          detalle: Json | null
          fecha: string
          id: string
          rol: string | null
          tienda_id: string | null
          usuario_id: string | null
        }
        Insert: {
          accion: string
          detalle?: Json | null
          fecha?: string
          id?: string
          rol?: string | null
          tienda_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          detalle?: Json | null
          fecha?: string
          id?: string
          rol?: string | null
          tienda_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cierres_caja: {
        Row: {
          contado_credito: number
          contado_efectivo: number
          contado_parte_pago: number
          contado_transferencia: number
          equipos_contados: number
          equipos_esperados: number
          esperado_credito: number
          esperado_efectivo: number
          esperado_parte_pago: number
          esperado_transferencia: number
          fecha: string
          fondo_inicial: number
          id: string
          imeis_faltantes: string[]
          tienda_id: string
          usuario_id: string | null
        }
        Insert: {
          contado_credito?: number
          contado_efectivo?: number
          contado_parte_pago?: number
          contado_transferencia?: number
          equipos_contados?: number
          equipos_esperados?: number
          esperado_credito?: number
          esperado_efectivo?: number
          esperado_parte_pago?: number
          esperado_transferencia?: number
          fecha?: string
          fondo_inicial?: number
          id?: string
          imeis_faltantes?: string[]
          tienda_id: string
          usuario_id?: string | null
        }
        Update: {
          contado_credito?: number
          contado_efectivo?: number
          contado_parte_pago?: number
          contado_transferencia?: number
          equipos_contados?: number
          equipos_esperados?: number
          esperado_credito?: number
          esperado_efectivo?: number
          esperado_parte_pago?: number
          esperado_transferencia?: number
          fecha?: string
          fondo_inicial?: number
          id?: string
          imeis_faltantes?: string[]
          tienda_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cierres_caja_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierres_caja_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          correo: string | null
          created_at: string
          id: string
          instagram: string | null
          nombre: string
          telefono: string | null
        }
        Insert: {
          correo?: string | null
          created_at?: string
          id?: string
          instagram?: string | null
          nombre: string
          telefono?: string | null
        }
        Update: {
          correo?: string | null
          created_at?: string
          id?: string
          instagram?: string | null
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      equipos: {
        Row: {
          bateria: number | null
          bloqueo_operador: boolean | null
          bloqueo_usa: string | null
          categoria: Database["public"]["Enums"]["categoria_equipo"]
          color: string | null
          costo: number
          email_vinculado: string | null
          estado: Database["public"]["Enums"]["equipo_estado"]
          fecha_compra_estimada: string | null
          fecha_ingreso: string
          garantia_estado: string | null
          gb: number | null
          icloud_activo: boolean | null
          id: string
          imei: string
          imei2: string | null
          lista_negra: boolean | null
          lote: string | null
          modelo: string
          notas: string | null
          pais_compra: string | null
          proveedor: string | null
          reemplazado_apple: boolean | null
          riesgo_aceptado_at: string | null
          riesgo_aceptado_por: string | null
          serie: string | null
          ubicacion_id: string | null
          updated_at: string
          verificado_at: string | null
        }
        Insert: {
          bateria?: number | null
          bloqueo_operador?: boolean | null
          bloqueo_usa?: string | null
          categoria?: Database["public"]["Enums"]["categoria_equipo"]
          color?: string | null
          costo?: number
          email_vinculado?: string | null
          estado?: Database["public"]["Enums"]["equipo_estado"]
          fecha_compra_estimada?: string | null
          fecha_ingreso?: string
          garantia_estado?: string | null
          gb?: number | null
          icloud_activo?: boolean | null
          id?: string
          imei: string
          imei2?: string | null
          lista_negra?: boolean | null
          lote?: string | null
          modelo: string
          notas?: string | null
          pais_compra?: string | null
          proveedor?: string | null
          reemplazado_apple?: boolean | null
          riesgo_aceptado_at?: string | null
          riesgo_aceptado_por?: string | null
          serie?: string | null
          ubicacion_id?: string | null
          updated_at?: string
          verificado_at?: string | null
        }
        Update: {
          bateria?: number | null
          bloqueo_operador?: boolean | null
          bloqueo_usa?: string | null
          categoria?: Database["public"]["Enums"]["categoria_equipo"]
          color?: string | null
          costo?: number
          email_vinculado?: string | null
          estado?: Database["public"]["Enums"]["equipo_estado"]
          fecha_compra_estimada?: string | null
          fecha_ingreso?: string
          garantia_estado?: string | null
          gb?: number | null
          icloud_activo?: boolean | null
          id?: string
          imei?: string
          imei2?: string | null
          lista_negra?: boolean | null
          lote?: string | null
          modelo?: string
          notas?: string | null
          pais_compra?: string | null
          proveedor?: string | null
          reemplazado_apple?: boolean | null
          riesgo_aceptado_at?: string | null
          riesgo_aceptado_por?: string | null
          serie?: string | null
          ubicacion_id?: string | null
          updated_at?: string
          verificado_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipos_riesgo_aceptado_por_fkey"
            columns: ["riesgo_aceptado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      equipos_historial: {
        Row: {
          equipo_id: string
          evento: string
          fecha: string
          id: string
          usuario_id: string | null
        }
        Insert: {
          equipo_id: string
          evento: string
          fecha?: string
          id?: string
          usuario_id?: string | null
        }
        Update: {
          equipo_id?: string
          evento?: string
          fecha?: string
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipos_historial_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_historial_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_equipos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_historial_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_historial_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_taller"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "equipos_historial_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_tecnico_historial"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "equipos_historial_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      garantias: {
        Row: {
          cliente_nombre: string
          cliente_telefono: string | null
          diferencia: number
          equipo_id: string | null
          estado: string
          falla: string
          fecha: string
          fecha_cierre: string | null
          id: string
          imei: string
          imei_entregado: string | null
          notas: string | null
          recibio_id: string | null
          resolucion: string | null
          tienda_id: string
        }
        Insert: {
          cliente_nombre: string
          cliente_telefono?: string | null
          diferencia?: number
          equipo_id?: string | null
          estado?: string
          falla: string
          fecha?: string
          fecha_cierre?: string | null
          id?: string
          imei: string
          imei_entregado?: string | null
          notas?: string | null
          recibio_id?: string | null
          resolucion?: string | null
          tienda_id: string
        }
        Update: {
          cliente_nombre?: string
          cliente_telefono?: string | null
          diferencia?: number
          equipo_id?: string | null
          estado?: string
          falla?: string
          fecha?: string
          fecha_cierre?: string | null
          id?: string
          imei?: string
          imei_entregado?: string | null
          notas?: string | null
          recibio_id?: string | null
          resolucion?: string | null
          tienda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_equipos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_taller"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_tecnico_historial"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "garantias_recibio_id_fkey"
            columns: ["recibio_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: string
          descripcion: string | null
          fecha: string
          id: string
          monto: number
          tienda_id: string | null
          usuario_id: string | null
        }
        Insert: {
          categoria: string
          descripcion?: string | null
          fecha: string
          id?: string
          monto: number
          tienda_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          categoria?: string
          descripcion?: string | null
          fecha?: string
          id?: string
          monto?: number
          tienda_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      imei_verificaciones: {
        Row: {
          costo: number
          fecha: string
          id: string
          imei: string
          properties: Json
          respuesta: Json | null
          service_id: number
          status: string
          usuario_id: string | null
        }
        Insert: {
          costo?: number
          fecha?: string
          id?: string
          imei: string
          properties?: Json
          respuesta?: Json | null
          service_id: number
          status: string
          usuario_id?: string | null
        }
        Update: {
          costo?: number
          fecha?: string
          id?: string
          imei?: string
          properties?: Json
          respuesta?: Json | null
          service_id?: number
          status?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imei_verificaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      imeicheck_config: {
        Row: {
          ambiente: string
          id: number
          service_id: number
          service_nombre: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ambiente?: string
          id?: number
          service_id?: number
          service_nombre?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ambiente?: string
          id?: number
          service_id?: number
          service_nombre?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imeicheck_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          equipos_objetivo: number
          ganancia_objetivo: number
          id: string
          periodo: string
          tienda_id: string
        }
        Insert: {
          equipos_objetivo?: number
          ganancia_objetivo?: number
          id?: string
          periodo: string
          tienda_id: string
        }
        Update: {
          equipos_objetivo?: number
          ganancia_objetivo?: number
          id?: string
          periodo?: string
          tienda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos: {
        Row: {
          desde_id: string | null
          equipo_id: string
          fecha: string
          hacia_id: string | null
          id: string
          usuario_id: string | null
        }
        Insert: {
          desde_id?: string | null
          equipo_id: string
          fecha?: string
          hacia_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Update: {
          desde_id?: string | null
          equipo_id?: string
          fecha?: string
          hacia_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_desde_id_fkey"
            columns: ["desde_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_equipos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_taller"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "movimientos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_tecnico_historial"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "movimientos_hacia_id_fkey"
            columns: ["hacia_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          fecha: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          nombre_pagador: string | null
          reserva_id: string | null
          venta_id: string | null
        }
        Insert: {
          fecha?: string
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          nombre_pagador?: string | null
          reserva_id?: string | null
          venta_id?: string | null
        }
        Update: {
          fecha?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          nombre_pagador?: string | null
          reserva_id?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      precios: {
        Row: {
          gb: number
          id: string
          modelo: string
          precio: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          gb: number
          id?: string
          modelo: string
          precio: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          gb?: number
          id?: string
          modelo?: string
          precio?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precios_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_items: {
        Row: {
          accesorio_id: string | null
          costo_snapshot: number
          equipo_id: string | null
          id: string
          precio: number
          reserva_id: string
        }
        Insert: {
          accesorio_id?: string | null
          costo_snapshot?: number
          equipo_id?: string | null
          id?: string
          precio?: number
          reserva_id: string
        }
        Update: {
          accesorio_id?: string | null
          costo_snapshot?: number
          equipo_id?: string | null
          id?: string
          precio?: number
          reserva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_items_accesorio_id_fkey"
            columns: ["accesorio_id"]
            isOneToOne: false
            referencedRelation: "accesorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_equipos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_taller"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "reserva_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_tecnico_historial"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "reserva_items_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas: {
        Row: {
          abono: number
          cliente_id: string | null
          destino_abono: string | null
          estado: string
          fecha: string
          id: string
          saldo: number
          tienda_id: string
          total: number
          vendedor_id: string | null
        }
        Insert: {
          abono?: number
          cliente_id?: string | null
          destino_abono?: string | null
          estado?: string
          fecha?: string
          id?: string
          saldo?: number
          tienda_id: string
          total?: number
          vendedor_id?: string | null
        }
        Update: {
          abono?: number
          cliente_id?: string | null
          destino_abono?: string | null
          estado?: string
          fecha?: string
          id?: string
          saldo?: number
          tienda_id?: string
          total?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios_equipo: {
        Row: {
          asignado_at: string | null
          costo: number
          created_at: string
          equipo_id: string
          estado: string
          id: string
          listo_at: string | null
          tecnico_id: string | null
          tipo: Database["public"]["Enums"]["tipo_servicio"]
        }
        Insert: {
          asignado_at?: string | null
          costo?: number
          created_at?: string
          equipo_id: string
          estado?: string
          id?: string
          listo_at?: string | null
          tecnico_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_servicio"]
        }
        Update: {
          asignado_at?: string | null
          costo?: number
          created_at?: string
          equipo_id?: string
          estado?: string
          id?: string
          listo_at?: string | null
          tecnico_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_servicio"]
        }
        Relationships: [
          {
            foreignKeyName: "servicios_equipo_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_equipo_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_equipos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_equipo_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_equipo_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_taller"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "servicios_equipo_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_tecnico_historial"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "servicios_equipo_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "tecnicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_equipo_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "v_taller"
            referencedColumns: ["tecnico_id"]
          },
          {
            foreignKeyName: "servicios_equipo_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "v_tecnico_historial"
            referencedColumns: ["tecnico_id"]
          },
        ]
      }
      tareas: {
        Row: {
          asignado_id: string | null
          created_by: string | null
          descripcion: string | null
          fecha: string
          hecha: boolean
          id: string
          tipo: string | null
          titulo: string
          urgencia: string
        }
        Insert: {
          asignado_id?: string | null
          created_by?: string | null
          descripcion?: string | null
          fecha?: string
          hecha?: boolean
          id?: string
          tipo?: string | null
          titulo: string
          urgencia?: string
        }
        Update: {
          asignado_id?: string | null
          created_by?: string | null
          descripcion?: string | null
          fecha?: string
          hecha?: boolean
          id?: string
          tipo?: string | null
          titulo?: string
          urgencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_asignado_id_fkey"
            columns: ["asignado_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      tecnicos: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      tiendas: {
        Row: {
          color_acento: string
          created_at: string
          es_bodega: boolean
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          color_acento: string
          created_at?: string
          es_bodega?: boolean
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          color_acento?: string
          created_at?: string
          es_bodega?: boolean
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          bloqueado_hasta: string | null
          created_at: string
          debe_cambiar_pin: boolean
          email_interno: string
          id: string
          intentos_fallidos: number
          nombre: string
          pin_hash: string
          rol: Database["public"]["Enums"]["app_rol"]
          tienda_id: string | null
          usuario: string
        }
        Insert: {
          activo?: boolean
          auth_user_id?: string | null
          bloqueado_hasta?: string | null
          created_at?: string
          debe_cambiar_pin?: boolean
          email_interno: string
          id?: string
          intentos_fallidos?: number
          nombre: string
          pin_hash: string
          rol: Database["public"]["Enums"]["app_rol"]
          tienda_id?: string | null
          usuario: string
        }
        Update: {
          activo?: boolean
          auth_user_id?: string | null
          bloqueado_hasta?: string | null
          created_at?: string
          debe_cambiar_pin?: boolean
          email_interno?: string
          id?: string
          intentos_fallidos?: number
          nombre?: string
          pin_hash?: string
          rol?: Database["public"]["Enums"]["app_rol"]
          tienda_id?: string | null
          usuario?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_items: {
        Row: {
          accesorio_id: string | null
          costo_snapshot: number
          equipo_id: string | null
          id: string
          precio: number
          venta_id: string
        }
        Insert: {
          accesorio_id?: string | null
          costo_snapshot?: number
          equipo_id?: string | null
          id?: string
          precio?: number
          venta_id: string
        }
        Update: {
          accesorio_id?: string | null
          costo_snapshot?: number
          equipo_id?: string | null
          id?: string
          precio?: number
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_items_accesorio_id_fkey"
            columns: ["accesorio_id"]
            isOneToOne: false
            referencedRelation: "accesorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_equipos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_taller"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "venta_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_tecnico_historial"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          anulada: boolean
          cliente_id: string | null
          con_boleta: boolean
          fecha: string
          fecha_anulacion: string | null
          ganancia: number
          id: string
          recargo_boleta: number
          reserva_id: string | null
          revision: string | null
          tienda_id: string
          total: number
          vendedor_id: string | null
        }
        Insert: {
          anulada?: boolean
          cliente_id?: string | null
          con_boleta?: boolean
          fecha?: string
          fecha_anulacion?: string | null
          ganancia?: number
          id?: string
          recargo_boleta?: number
          reserva_id?: string | null
          revision?: string | null
          tienda_id: string
          total?: number
          vendedor_id?: string | null
        }
        Update: {
          anulada?: boolean
          cliente_id?: string | null
          con_boleta?: boolean
          fecha?: string
          fecha_anulacion?: string | null
          ganancia?: number
          id?: string
          recargo_boleta?: number
          reserva_id?: string | null
          revision?: string | null
          tienda_id?: string
          total?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_equipos_full: {
        Row: {
          bateria: number | null
          categoria: Database["public"]["Enums"]["categoria_equipo"] | null
          color: string | null
          costo: number | null
          email_vinculado: string | null
          estado: Database["public"]["Enums"]["equipo_estado"] | null
          fecha_ingreso: string | null
          gb: number | null
          id: string | null
          imei: string | null
          lote: string | null
          modelo: string | null
          notas: string | null
          proveedor: string | null
          serie: string | null
          tienda: string | null
          ubicacion_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_garantias: {
        Row: {
          cliente_nombre: string | null
          cliente_telefono: string | null
          color: string | null
          costo_arreglo: number | null
          diferencia: number | null
          equipo_estado: Database["public"]["Enums"]["equipo_estado"] | null
          equipo_id: string | null
          estado: string | null
          falla: string | null
          fecha: string | null
          fecha_cierre: string | null
          gb: number | null
          horas: number | null
          id: string | null
          imei: string | null
          imei_entregado: string | null
          modelo: string | null
          notas: string | null
          recibio: string | null
          resolucion: string | null
          servicios_pendientes: number | null
          tienda: string | null
          tienda_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_equipos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_taller"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "garantias_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "v_tecnico_historial"
            referencedColumns: ["equipo_id"]
          },
          {
            foreignKeyName: "garantias_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_movimientos: {
        Row: {
          desde: string | null
          desde_id: string | null
          fecha: string | null
          hacia: string | null
          hacia_id: string | null
          id: string | null
          imei: string | null
          modelo: string | null
          movido_por: string | null
          usuario_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_desde_id_fkey"
            columns: ["desde_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_hacia_id_fkey"
            columns: ["hacia_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock: {
        Row: {
          bateria: number | null
          bloqueo_operador: boolean | null
          bloqueo_usa: string | null
          categoria: Database["public"]["Enums"]["categoria_equipo"] | null
          color: string | null
          estado: Database["public"]["Enums"]["equipo_estado"] | null
          fecha_compra_estimada: string | null
          fecha_ingreso: string | null
          garantia_estado: string | null
          gb: number | null
          icloud_activo: boolean | null
          id: string | null
          imei: string | null
          imei2: string | null
          lista_negra: boolean | null
          modelo: string | null
          pais_compra: string | null
          reemplazado_apple: boolean | null
          serie: string | null
          tienda: string | null
          ubicacion_id: string | null
          verificado_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_taller: {
        Row: {
          asignado_at: string | null
          color: string | null
          equipo_id: string | null
          gb: number | null
          imei: string | null
          modelo: string | null
          servicio_id: string | null
          tecnico: string | null
          tecnico_id: string | null
          tienda: string | null
          tipo: Database["public"]["Enums"]["tipo_servicio"] | null
          ubicacion_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tecnico_historial: {
        Row: {
          asignado_at: string | null
          color: string | null
          costo_total: number | null
          dias: number | null
          equipo_id: string | null
          gb: number | null
          imei: string | null
          modelo: string | null
          salida_at: string | null
          servicios: string | null
          tecnico: string | null
          tecnico_id: string | null
          total_servicios: number | null
        }
        Relationships: []
      }
      v_ventas_full: {
        Row: {
          anulada: boolean | null
          cliente_id: string | null
          con_boleta: boolean | null
          fecha: string | null
          fecha_anulacion: string | null
          ganancia: number | null
          id: string | null
          recargo_boleta: number | null
          reserva_id: string | null
          revision: string | null
          tienda_id: string | null
          total: number | null
          vendedor_id: string | null
        }
        Insert: {
          anulada?: boolean | null
          cliente_id?: string | null
          con_boleta?: boolean | null
          fecha?: string | null
          fecha_anulacion?: string | null
          ganancia?: number | null
          id?: string | null
          recargo_boleta?: number | null
          reserva_id?: string | null
          revision?: string | null
          tienda_id?: string | null
          total?: number | null
          vendedor_id?: string | null
        }
        Update: {
          anulada?: boolean | null
          cliente_id?: string | null
          con_boleta?: boolean | null
          fecha?: string | null
          fecha_anulacion?: string | null
          ganancia?: number | null
          id?: string | null
          recargo_boleta?: number | null
          reserva_id?: string | null
          revision?: string | null
          tienda_id?: string | null
          total?: number | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      agregar_servicios_equipo: {
        Args: { _equipo: string; _servicios: Json }
        Returns: number
      }
      ajustar_stock_accesorio: {
        Args: {
          _accesorio: string
          _delta: number
          _motivo: string
          _tienda: string
        }
        Returns: number
      }
      anular_venta: { Args: { _venta: string }; Returns: undefined }
      asignar_equipos_tecnico: {
        Args: { _imeis: string[]; _tecnico: string }
        Returns: number
      }
      cambiar_pin: { Args: { _pin_nuevo: string }; Returns: undefined }
      cancelar_reserva: {
        Args: { _destino_abono: string; _reserva: string }
        Returns: undefined
      }
      completar_reserva: {
        Args: { _pagos: Json; _reserva: string }
        Returns: string
      }
      crear_garantia: {
        Args: {
          _cliente_nombre: string
          _cliente_telefono: string
          _falla: string
          _imei: string
          _notas: string
          _tienda: string
        }
        Returns: string
      }
      crear_reserva: {
        Args: {
          _abono: number
          _cliente: string
          _items: Json
          _pagos: Json
          _tienda: string
        }
        Returns: string
      }
      equipo_servicios_listos: { Args: { _equipo_id: string }; Returns: number }
      fn_sin_sensibles: { Args: { _fila: Json }; Returns: Json }
      garantia_buscar_imei: {
        Args: { _imei: string }
        Returns: {
          cliente_nombre: string
          cliente_telefono: string
          color: string
          dias_desde_venta: number
          equipo_id: string
          estado: string
          fecha_venta: string
          gb: number
          imei: string
          modelo: string
          tienda_venta: string
          venta_id: string
        }[]
      }
      garantia_costo_arreglo: { Args: { _garantia: string }; Returns: number }
      garantia_mandar_tecnico: {
        Args: { _garantia: string; _servicios: Json }
        Returns: number
      }
      guardar_verificacion_equipo: {
        Args: { _datos: Json; _imei: string; _riesgo_aceptado?: boolean }
        Returns: string
      }
      login_lookup: {
        Args: { _pin: string; _usuario: string }
        Returns: {
          debe_cambiar_pin: boolean
          email_interno: string
        }[]
      }
      marcar_equipo_disponible: {
        Args: { _equipo: string }
        Returns: undefined
      }
      marcar_revision_venta: {
        Args: { _estado: string; _nota?: string; _venta: string }
        Returns: undefined
      }
      mi_rol: { Args: never; Returns: Database["public"]["Enums"]["app_rol"] }
      mi_tienda: { Args: never; Returns: string }
      mi_usuario_id: { Args: never; Returns: string }
      puede_operar_garantias: { Args: never; Returns: boolean }
      puede_ver_tienda: { Args: { _tienda: string }; Returns: boolean }
      registrar_riesgo_imei: {
        Args: { _detalle?: Json; _imei: string; _motivos: string[] }
        Returns: undefined
      }
      registrar_venta: {
        Args: {
          _cliente: string
          _con_boleta: boolean
          _items: Json
          _pagos: Json
          _tienda: string
        }
        Returns: string
      }
      resolver_garantia_cambio: {
        Args: {
          _diferencia: number
          _garantia: string
          _imei_reemplazo: string
        }
        Returns: undefined
      }
      resolver_garantia_reparado: {
        Args: { _garantia: string }
        Returns: undefined
      }
      servicio_listo: { Args: { _servicio_id: string }; Returns: string }
      trasladar_equipos: {
        Args: { _destino: string; _imeis: string[]; _origen: string }
        Returns: number
      }
      ve_costos: { Args: { _tienda?: string }; Returns: boolean }
      ve_ganancias: { Args: { _tienda?: string }; Returns: boolean }
      ve_todas_tiendas: { Args: never; Returns: boolean }
    }
    Enums: {
      app_rol:
        | "direccion"
        | "jefe_tienda"
        | "administracion"
        | "operaciones"
        | "vendedor"
      categoria_accesorio:
        | "cargador"
        | "carcasa"
        | "mica"
        | "audifonos"
        | "otro"
      categoria_equipo: "sellado" | "openbox" | "seminuevo" | "reacondicionado"
      equipo_estado:
        | "POR_REVISAR"
        | "EN_TECNICO"
        | "DISPONIBLE"
        | "RESERVADO"
        | "VENDIDO"
        | "ENTREGADO"
        | "GARANTIA"
      metodo_pago: "efectivo" | "transferencia" | "credito" | "partePago"
      tipo_servicio:
        | "bateria"
        | "pantalla"
        | "chasis"
        | "camara"
        | "parlante"
        | "faceid"
        | "puerto_carga"
        | "limpieza"
        | "homologacion"
        | "otro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_rol: [
        "direccion",
        "jefe_tienda",
        "administracion",
        "operaciones",
        "vendedor",
      ],
      categoria_accesorio: ["cargador", "carcasa", "mica", "audifonos", "otro"],
      categoria_equipo: ["sellado", "openbox", "seminuevo", "reacondicionado"],
      equipo_estado: [
        "POR_REVISAR",
        "EN_TECNICO",
        "DISPONIBLE",
        "RESERVADO",
        "VENDIDO",
        "ENTREGADO",
        "GARANTIA",
      ],
      metodo_pago: ["efectivo", "transferencia", "credito", "partePago"],
      tipo_servicio: [
        "bateria",
        "pantalla",
        "chasis",
        "camara",
        "parlante",
        "faceid",
        "puerto_carga",
        "limpieza",
        "homologacion",
        "otro",
      ],
    },
  },
} as const
