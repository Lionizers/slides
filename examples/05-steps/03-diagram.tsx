<Content title="A diagram, built step by step">
  <Lane>
    <Row width="half">
      <Box center color="blue" name="Test data" />
    </Row>
    <Step>
      <Connector to={2} />
      <Row>
        <Box color="olive" variant="accent" name="New version" tags={['v2']} />
        <Box color="violet" name="Old version" tags={['Reference']} />
      </Row>
    </Step>
    <Step>
      <Connector from={2} />
      <Row width="half">
        <Box center color="teal" name="Comparison" highlight={['100 % match']} />
      </Row>
    </Step>
  </Lane>
</Content>
