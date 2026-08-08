/**
 * Tela de edição de letra no controlador (porta 3001).
 *
 * Carrega uma música via GET e permite editar título, artista e slides.
 * Ao salvar, envia PUT (fallback POST /salvar). Originais imutáveis (`is_immutable`)
 * geram fork no controlador — resposta com `forked` + novo `id`.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import SlideEditorPanel from '../src/SlideEditorPanel';
import AlertaAmbar from '../src/AlertaAmbar';
import { COLORS, FONTS } from '../src/theme';
import { urlApiControlador } from '../src/lyraEndpoints';

/**
 * @param {string|string[]|undefined|null} v
 * @returns {string}
 */
function normParam(v) {
  if (v == null) return '';
  return Array.isArray(v) ? String(v[0] ?? '').trim() : String(v).trim();
}

/**
 * @param {string} fonte
 * @returns {string}
 */
function qsFonteMusica(fonte) {
  return String(fonte || '').toLowerCase() === 'catalog' ? '?fonte=catalog' : '';
}

export default function ServidorEditScreen() {
  const params = useLocalSearchParams();
  const ip = normParam(params.ip);
  const musicaId = normParam(params.musicaId);
  const musicaFonte = normParam(params.musicaFonte) || 'user';

  const [carregando, setCarregando] = useState(true);
  const [pacote, setPacote] = useState(null);
  const [imutavel, setImutavel] = useState(false);
  const [rotulo, setRotulo] = useState('');

  const [titulo, setTitulo] = useState('');
  const [artista, setArtista] = useState('');
  const [slides, setSlides] = useState(['']);

  useEffect(() => {
    let cancel = false;

    if (!ip || !musicaId) {
      setCarregando(false);
      Alert.alert('Erro', 'Sem IP ou ID da música. Volte e ligue na tela inicial.');
      router.back();
      return undefined;
    }

    if (musicaFonte === 'catalog') {
      setCarregando(false);
      Alert.alert(
        'Catálogo',
        'Músicas do catálogo pré-carregado não podem ser editadas pelo telemóvel. Importe-as para o banco do usuário no controlador.'
      );
      router.back();
      return undefined;
    }

    (async () => {
      try {
        const qs = qsFonteMusica(musicaFonte);
        const url = `${urlApiControlador(ip)}/api/musicas/${encodeURIComponent(musicaId)}${qs}`;
        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.erro || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancel) return;

        const est =
          Array.isArray(data.estrofes) && data.estrofes.length
            ? data.estrofes.map((s) => String(s ?? ''))
            : [''];

        const t = data.titulo || '';
        const a = data.artista || '';

        setTitulo(t);
        setArtista(a);
        setSlides(est);
        setImutavel(Number(data.is_immutable) === 1);
        setRotulo(String(data.rotulo || '').trim());
        setPacote({
          id: String(data.id ?? musicaId),
          titulo: t,
          artista: a,
          estrofes: est,
        });
      } catch (e) {
        Alert.alert(
          'Erro',
          e?.message ||
            'Não foi possível carregar a música. Confirme o IP do controlador (porta 3001) e a rede.'
        );
        router.back();
      } finally {
        if (!cancel) setCarregando(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [ip, musicaId, musicaFonte]);

  async function guardar() {
    const estrofes = slides
      .map((s) => String(s || '').trim())
      .filter((s) => s.length > 0);

    const t = titulo.trim();
    if (!t) {
      Alert.alert('Atenção', 'Informe o título.');
      return;
    }
    if (estrofes.length === 0) {
      Alert.alert('Atenção', 'Preencha pelo menos um slide com texto.');
      return;
    }

    const body = JSON.stringify({
      titulo: t,
      artista: artista.trim(),
      estrofes,
    });

    try {
      let res = await fetch(`${urlApiControlador(ip)}/api/musicas/${encodeURIComponent(musicaId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) {
        res = await fetch(
          `${urlApiControlador(ip)}/api/musicas/${encodeURIComponent(musicaId)}/salvar`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }
        );
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.erro || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data.forked && data.id != null) {
        Alert.alert(
          'Guardado',
          'Foi criada uma nova cópia no controlador; o original foi preservado.'
        );
      } else {
        Alert.alert('Guardado', 'Letra atualizada no controlador.');
      }
      router.back();
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível guardar.');
    }
  }

  if (carregando || !pacote) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.pad}>
        <SlideEditorPanel
          key={`srv-${pacote.id}-${pacote.estrofes.length}`}
          initialSlides={pacote.estrofes}
          onSlidesChange={setSlides}
          listHeaderComponent={
            <View style={styles.headerBlock}>
              <Text style={styles.hint}>
                Alterações gravadas na base do controlador. Use o seletor para editar em slides ou
                letra completa (igual ao PC).
              </Text>

              {/* Comportamento crítico da tela — mesmo alerta âmbar usado na home */}
              <AlertaAmbar
                visible={imutavel}
                destaque="Original protegido:"
                texto="mudar a letra cria uma nova cópia; só título/artista atualizam o original."
              />

              {rotulo ? <Text style={styles.hintRotulo}>Versão: {rotulo}</Text> : null}

              <Text style={styles.label}>TÍTULO</Text>
              <TextInput
                style={styles.input}
                value={titulo}
                onChangeText={setTitulo}
                placeholder="Nome da música"
                placeholderTextColor={COLORS.textDim}
              />

              <Text style={styles.label}>ARTISTA</Text>
              <TextInput
                style={styles.input}
                value={artista}
                onChangeText={setArtista}
                placeholder="Opcional"
                placeholderTextColor={COLORS.textDim}
              />
            </View>
          }
          listFooterComponent={
            <TouchableOpacity style={styles.btnSalvar} onPress={guardar}>
              <Text style={styles.btnSalvarTxt}>GUARDAR NO CONTROLADOR</Text>
            </TouchableOpacity>
          }
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  pad: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  headerBlock: { paddingBottom: 4 },
  hint: { fontSize: 13, color: COLORS.textDim, marginBottom: 14, lineHeight: 19, fontFamily: FONTS.regular },
  hintRotulo: {
    fontSize: 11,
    color: COLORS.accent,
    marginBottom: 10,
    letterSpacing: 1,
    fontFamily: FONTS.semibold,
  },
  label: { fontSize: 11, letterSpacing: 2, color: COLORS.textDim, marginBottom: 6, fontFamily: FONTS.semibold },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    color: COLORS.text,
    padding: 12,
    fontSize: 16,
    marginBottom: 14,
    fontFamily: FONTS.regular,
  },
  btnSalvar: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  btnSalvarTxt: {
    color: COLORS.onAccent,
    fontFamily: FONTS.bold,
    letterSpacing: 2,
    fontSize: 13,
  },
});
