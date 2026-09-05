import type { Certainty, SceneAnalysis, SoundCue } from "./types";

const CERTAINTY_LABEL: Record<Certainty, string> = {
  observed: "observado",
  probable: "probable",
  possible: "posible",
};

function Cue({ cue }: { cue: SoundCue }) {
  return (
    <span className={`scene-analysis__cue certainty-${cue.certainty}`}>
      {cue.text}
      <em>{CERTAINTY_LABEL[cue.certainty]}</em>
    </span>
  );
}

function CueRow({ title, cues }: { title: string; cues: SoundCue[] }) {
  if (cues.length === 0) return null;
  return (
    <div className="scene-analysis__section">
      <div className="scene-analysis__section-title">{title}</div>
      <div className="scene-analysis__cues">
        {cues.map((c, i) => (
          <Cue key={i} cue={c} />
        ))}
      </div>
    </div>
  );
}

function SingleCueRow({ title, cue }: { title: string; cue: SoundCue }) {
  if (!cue.text) return null;
  return (
    <div className="scene-analysis__section">
      <div className="scene-analysis__section-title">{title}</div>
      <div className="scene-analysis__cues">
        <Cue cue={cue} />
      </div>
    </div>
  );
}

export function SceneAnalysisView({ analysis }: { analysis: SceneAnalysis }) {
  return (
    <div className="scene-analysis">
      {analysis.sceneDescription && <p className="scene-analysis__summary">{analysis.sceneDescription}</p>}

      <div className="scene-analysis__group">
        <SingleCueRow title="lugar" cue={analysis.place} />
        <SingleCueRow title="interior / exterior" cue={analysis.indoorOutdoor} />
        <SingleCueRow title="momento del día" cue={analysis.timeOfDay} />
        <SingleCueRow title="clima" cue={analysis.weather} />
        <CueRow title="materiales y superficies" cues={analysis.materialsAndSurfaces} />
        <SingleCueRow title="presencia humana" cue={analysis.humanPresence} />
      </div>

      <div className="scene-analysis__group">
        <CueRow title="fuentes sonoras potenciales" cues={analysis.potentialSoundSources} />
        <CueRow title="acciones observadas" cues={analysis.observedActions} />
        <CueRow title="fuera de campo" cues={analysis.offScreenSources} />
      </div>

      <div className="scene-analysis__group">
        <CueRow title="ambiente" cues={analysis.ambience} />
        <CueRow title="efectos" cues={analysis.effects} />
        <CueRow title="foley" cues={analysis.foley} />
        <CueRow title="diálogo" cues={analysis.dialogue} />
        <CueRow title="ideas narrativas" cues={analysis.narrativeIdeas} />
      </div>
    </div>
  );
}
