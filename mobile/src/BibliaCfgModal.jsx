/**
 * Modal de configurações Bíblia — replica o menu do Controlador PC
 * (Fundo, Versículo, Referência, Posição) com abas M2 / M3 / Leitura.
 */

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, FONTS } from './theme';
import {
  BIBLIA_FONTES,
  BIBLIA_CORES_PRESET,
  BIBLIA_FONTE_MIN,
  BIBLIA_FONTE_MAX,
  BIBLIA_FONTE_STEP,
  BIBLIA_REF_FONTE_MIN,
  BIBLIA_REF_FONTE_MAX,
  BIBLIA_ESPACO_MIN,
  BIBLIA_ESPACO_MAX,
  BIBLIA_ESPACO_STEP,
  bibliaGradienteCss,
  BIBLIA_CAMADA_M2_PADRAO,
  BIBLIA_CAMADA_M3_PADRAO,
} from './bibliaExibicao';
import { LIMITES_DIVISAO_VERSICULO } from './dividirVersiculos';

const ABAS = [
  { id: 'm2', label: 'M2' },
  { id: 'm3', label: 'M3' },
  { id: 'leitura', label: 'Leitura' },
];

const BG_TIPOS = [
  { id: 'solid', label: 'Cor sólida' },
  { id: 'gradient', label: 'Gradiente' },
  { id: 'image', label: 'Imagem' },
];

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {object} props.cfg
 * @param {(cfg: object) => void} props.onChange
 */
export default function BibliaCfgModal({ visible, onClose, cfg, onChange }) {
  const [aba, setAba] = useState('m2');
  const [escolhendoImagem, setEscolhendoImagem] = useState(false);

  const camadaKey = aba === 'm3' ? 'm3' : 'm2';
  const padrao = aba === 'm3' ? BIBLIA_CAMADA_M3_PADRAO : BIBLIA_CAMADA_M2_PADRAO;
  const camada = aba === 'leitura' ? null : cfg?.[camadaKey] || padrao;

  function patchCamada(patch) {
    const atual = { ...(cfg?.[camadaKey] || padrao), ...patch };
    if (atual.bgType === 'gradient') {
      atual.bgGradient = bibliaGradienteCss(atual, padrao);
    }
    onChange({
      ...cfg,
      [camadaKey]: atual,
    });
  }

  function patchLeitura(patch) {
    onChange({
      ...cfg,
      leitura: { ...(cfg?.leitura || {}), ...patch },
    });
  }

  function stepNum(campo, delta, min, max) {
    const atual = Number(camada?.[campo]);
    const base = Number.isFinite(atual) ? atual : Number(padrao[campo]);
    const next = Math.min(max, Math.max(min, Math.round((base + delta) * 100) / 100));
    patchCamada({ [campo]: next });
  }

  async function escolherImagem() {
    try {
      setEscolhendoImagem(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão', 'Autorize o acesso às fotos para escolher o fundo.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      const asset = res.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      patchCamada({
        bgType: 'image',
        bgImage: `data:${mime};base64,${asset.base64}`,
      });
    } catch (e) {
      Alert.alert('Imagem', e?.message || 'Não foi possível carregar a imagem.');
    } finally {
      setEscolhendoImagem(false);
    }
  }

  const previewFundo = useMemo(() => {
    if (!camada) return null;
    if (camada.bgType === 'gradient') {
      return { backgroundColor: camada.bgGradientFrom };
    }
    if (camada.bgType === 'image' && camada.bgImage) {
      return { backgroundColor: COLORS.surface2 };
    }
    return { backgroundColor: camada.bgColor || '#000' };
  }, [camada]);

  function renderStepper(label, campo, valor, min, max, step, sufixo) {
    return (
      <View style={styles.bloco}>
        <Text style={styles.subLabel}>{label}</Text>
        <View style={styles.rowFonte}>
          <TouchableOpacity style={styles.btnStep} onPress={() => stepNum(campo, -step, min, max)}>
            <Text style={styles.btnStepTxt}>−</Text>
          </TouchableOpacity>
          <Text style={styles.fonteValor}>
            {Number(valor).toFixed(step < 0.1 ? 2 : 1)}
            {sufixo ? ` ${sufixo}` : ''}
          </Text>
          <TouchableOpacity style={styles.btnStep} onPress={() => stepNum(campo, step, min, max)}>
            <Text style={styles.btnStepTxt}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderSwitch(label, valor, onToggle) {
    return (
      <View style={styles.rowSwitch}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Switch
          value={!!valor}
          onValueChange={onToggle}
          trackColor={{ false: COLORS.border, true: COLORS.accent2 }}
          thumbColor={valor ? COLORS.accent : COLORS.surface2}
        />
      </View>
    );
  }

  function renderChips(label, opcoes, atual, onSelect) {
    return (
      <View style={styles.bloco}>
        <Text style={styles.subLabel}>{label}</Text>
        <View style={styles.rowPos}>
          {opcoes.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.chipPos, atual === o.id && styles.chipPosAtivo]}
              onPress={() => onSelect(o.id)}
            >
              <Text style={[styles.chipPosTxt, atual === o.id && styles.chipPosTxtAtivo]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  function renderCor(label, valor, onPick) {
    return (
      <View style={styles.bloco}>
        <Text style={styles.subLabel}>{label}</Text>
        <View style={styles.rowCores}>
          {BIBLIA_CORES_PRESET.map((hex) => (
            <TouchableOpacity
              key={hex}
              style={[
                styles.swatch,
                { backgroundColor: hex },
                valor?.toLowerCase() === hex && styles.swatchAtivo,
              ]}
              onPress={() => onPick(hex)}
            />
          ))}
        </View>
        <TextInput
          style={styles.inputHex}
          value={String(valor || '').toUpperCase()}
          onChangeText={(t) => onPick(t)}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="#FFFFFF"
          placeholderTextColor={COLORS.textDim}
        />
      </View>
    );
  }

  function renderCamada() {
    if (!camada) return null;
    return (
      <>
        <Text style={styles.hintCfg}>
          {aba === 'm2'
            ? 'Ajustes do telão / público (M2). Independentes do M3.'
            : 'Ajustes do ministrante (M3). Independentes do M2.'}
        </Text>

        <Text style={styles.secaoTitulo}>FUNDO</Text>
        {renderChips('Tipo de fundo', BG_TIPOS, camada.bgType, (id) => patchCamada({ bgType: id }))}
        <View style={[styles.previewFundo, previewFundo]}>
          <Text style={styles.previewFundoTxt}>
            {camada.bgType === 'image'
              ? camada.bgImage
                ? 'Imagem definida'
                : 'Sem imagem'
              : camada.bgType === 'gradient'
                ? 'Gradiente'
                : 'Cor sólida'}
          </Text>
        </View>
        {camada.bgType === 'solid'
          ? renderCor('Cor de fundo', camada.bgColor, (hex) => patchCamada({ bgColor: hex }))
          : null}
        {camada.bgType === 'gradient' ? (
          <>
            {renderCor('Cor inicial', camada.bgGradientFrom, (hex) =>
              patchCamada({ bgGradientFrom: hex })
            )}
            {renderCor('Cor final', camada.bgGradientTo, (hex) => patchCamada({ bgGradientTo: hex }))}
          </>
        ) : null}
        {camada.bgType === 'image' ? (
          <TouchableOpacity
            style={styles.btnSecundario}
            onPress={escolherImagem}
            disabled={escolhendoImagem}
          >
            {escolhendoImagem ? (
              <ActivityIndicator color={COLORS.accent} />
            ) : (
              <Text style={styles.btnSecundarioTxt}>
                {camada.bgImage ? 'TROCAR IMAGEM…' : 'ESCOLHER IMAGEM…'}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}

        <Text style={styles.secaoTitulo}>VERSÍCULO</Text>
        <Text style={styles.subLabel}>FAMÍLIA DA FONTE</Text>
        <View style={styles.colFontes}>
          {BIBLIA_FONTES.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.chipFonte, camada.fontFamily === f.value && styles.chipPosAtivo]}
              onPress={() => patchCamada({ fontFamily: f.value })}
            >
              <Text
                style={[
                  styles.chipPosTxt,
                  camada.fontFamily === f.value && styles.chipPosTxtAtivo,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {renderStepper(
          'TAMANHO DA LETRA',
          'fontSize',
          camada.fontSize,
          BIBLIA_FONTE_MIN,
          BIBLIA_FONTE_MAX,
          BIBLIA_FONTE_STEP,
          'vh'
        )}
        {renderStepper(
          'ESPAÇAMENTO ENTRE LINHAS',
          'lineSpacing',
          camada.lineSpacing,
          BIBLIA_ESPACO_MIN,
          BIBLIA_ESPACO_MAX,
          BIBLIA_ESPACO_STEP,
          ''
        )}
        {renderCor('Cor da letra', camada.textColor, (hex) => patchCamada({ textColor: hex }))}
        {aba === 'm3'
          ? renderCor('Cor do próximo (lista)', camada.textColorProximo, (hex) =>
              patchCamada({ textColorProximo: hex })
            )
          : null}
        {renderSwitch('Maiúsculas', camada.maiusculo, (v) => patchCamada({ maiusculo: v }))}
        {renderSwitch('Negrito', camada.negrito, (v) => patchCamada({ negrito: v }))}
        {renderSwitch('Quebra de linha automática', camada.wrapLongLines, (v) =>
          patchCamada({ wrapLongLines: v })
        )}

        <Text style={styles.secaoTitulo}>REFERÊNCIA</Text>
        {renderSwitch('Mostrar referência', camada.refMostrar, (v) =>
          patchCamada({ refMostrar: v })
        )}
        {renderStepper(
          'TAMANHO DA REFERÊNCIA',
          'refFontSize',
          camada.refFontSize,
          BIBLIA_REF_FONTE_MIN,
          BIBLIA_REF_FONTE_MAX,
          BIBLIA_FONTE_STEP,
          aba === 'm2' ? 'vw' : 'vh'
        )}
        {renderCor('Cor da referência', camada.refColor, (hex) => patchCamada({ refColor: hex }))}

        <Text style={styles.secaoTitulo}>POSIÇÃO NA TELA</Text>
        {renderChips(
          'Horizontal',
          [
            { id: 'left', label: 'Esq.' },
            { id: 'center', label: 'Centro' },
            { id: 'right', label: 'Dir.' },
          ],
          camada.posX,
          (id) => patchCamada({ posX: id })
        )}
        {renderChips(
          'Vertical',
          [
            { id: 'top', label: 'Topo' },
            { id: 'center', label: 'Meio' },
            { id: 'bottom', label: 'Rodapé' },
          ],
          camada.posY,
          (id) => patchCamada({ posY: id })
        )}
      </>
    );
  }

  function renderLeitura() {
    const leitura = cfg?.leitura || {};
    return (
      <>
        <Text style={styles.hintCfg}>
          Opções do modo Bíblia inteiro (não por monitor). No celular, versículos longos
          projetam a 1.ª parte quando a divisão está ativa.
        </Text>
        {renderSwitch('Dividir versículos longos automaticamente', leitura.dividirVersiculosLongos, (v) =>
          patchLeitura({ dividirVersiculosLongos: v })
        )}
        <Text style={styles.subLabel}>LIMITE POR PARTE</Text>
        <View style={styles.rowPos}>
          {LIMITES_DIVISAO_VERSICULO.map((n) => (
            <TouchableOpacity
              key={n}
              style={[
                styles.chipPos,
                leitura.dividirVersiculosLongos &&
                  leitura.limiteCaracteres === n &&
                  styles.chipPosAtivo,
                !leitura.dividirVersiculosLongos && styles.chipDesabilitado,
              ]}
              disabled={!leitura.dividirVersiculosLongos}
              onPress={() => patchLeitura({ limiteCaracteres: n })}
            >
              <Text
                style={[
                  styles.chipPosTxt,
                  leitura.dividirVersiculosLongos &&
                    leitura.limiteCaracteres === n &&
                    styles.chipPosTxtAtivo,
                ]}
              >
                {n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Configurações</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={26} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>

          <View style={styles.abas}>
            {ABAS.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.aba, aba === a.id && styles.abaAtiva]}
                onPress={() => setAba(a.id)}
              >
                <Text style={[styles.abaTxt, aba === a.id && styles.abaTxtAtiva]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {aba === 'leitura' ? renderLeitura() : renderCamada()}
          </ScrollView>

          <TouchableOpacity style={styles.btnModalFechar} onPress={onClose}>
            <Text style={styles.btnModalFecharTxt}>FECHAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitulo: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.text,
    letterSpacing: 1,
  },
  abas: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  aba: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  abaAtiva: { borderColor: COLORS.accent, backgroundColor: COLORS.surface2 },
  abaTxt: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textDim, letterSpacing: 1 },
  abaTxtAtiva: { color: COLORS.accent },
  hintCfg: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textDim,
    marginBottom: 14,
    lineHeight: 16,
  },
  secaoTitulo: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.accent2,
    marginTop: 8,
    marginBottom: 10,
  },
  bloco: { marginBottom: 4 },
  subLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: COLORS.textDim,
    marginBottom: 8,
    marginTop: 4,
  },
  rowFonte: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnStep: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStepTxt: { fontSize: 22, color: COLORS.accent, fontFamily: FONTS.bold },
  fonteValor: {
    minWidth: 88,
    textAlign: 'center',
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.text,
  },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  switchLabel: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text,
    marginRight: 8,
  },
  rowPos: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  chipPos: {
    flexGrow: 1,
    minWidth: 64,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  chipPosAtivo: { borderColor: COLORS.accent, backgroundColor: COLORS.surface2 },
  chipPosTxt: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.textDim },
  chipPosTxtAtivo: { color: COLORS.accent },
  chipDesabilitado: { opacity: 0.45 },
  colFontes: { gap: 8, marginBottom: 14 },
  chipFonte: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  rowCores: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  swatchAtivo: { borderColor: COLORS.accent, borderWidth: 2 },
  inputHex: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 14,
  },
  previewFundo: {
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFundoTxt: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  btnSecundario: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: COLORS.surface,
  },
  btnSecundarioTxt: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    letterSpacing: 1.5,
    color: COLORS.accent2,
  },
  btnModalFechar: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnModalFecharTxt: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    letterSpacing: 2,
    color: COLORS.textDim,
  },
});
